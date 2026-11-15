import type { ZodType, ZodTypeDef } from 'zod';
import { sha256 } from '../ledger/text';

export type ModelTier = 'small' | 'large';

/** Anything that can turn a system + user prompt into text. Forge LLMs in production, fakes in tests. */
export interface LlmClient {
  complete(tier: ModelTier, system: string, user: string, maxTokens?: number): Promise<string>;
}

export interface LlmCache {
  get(hash: string): Promise<string | null>;
  set(hash: string, value: string): Promise<void>;
}

export class LlmOutputError extends Error {}

/** Pull the first JSON object out of a model reply (handles ```json fences and stray prose). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1] ?? '' : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) throw new LlmOutputError('No JSON object in model output');
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Ask for strict JSON, validate with zod, retry once with the validation error appended.
 * Results are cached by a hash of (tier, prompts) because Forge LLM usage is billed.
 */
export async function completeJson<T>(
  llm: LlmClient,
  schema: ZodType<T, ZodTypeDef, unknown>,
  tier: ModelTier,
  system: string,
  user: string,
  cache?: LlmCache,
  maxTokens = 1500,
): Promise<T> {
  const hash = sha256(`${tier}\n${system}\n${user}`);
  if (cache) {
    const hit = await cache.get(hash).catch(() => null);
    if (hit) {
      const parsed = schema.safeParse(JSON.parse(hit));
      if (parsed.success) return parsed.data;
    }
  }
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? user
        : `${user}\n\nYour previous reply was rejected: ${lastError}\nReply again with ONLY one valid JSON object that matches the schema.`;
    const raw = await llm.complete(tier, system, prompt, maxTokens);
    try {
      const parsed = schema.safeParse(extractJson(raw));
      if (parsed.success) {
        if (cache) await cache.set(hash, JSON.stringify(parsed.data)).catch(() => undefined);
        return parsed.data;
      }
      lastError = parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'invalid JSON';
    }
  }
  throw new LlmOutputError(`Model output failed validation twice: ${lastError}`);
}
