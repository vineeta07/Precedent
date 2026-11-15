import { chat, list } from '@forge/llm';
import type { LlmCache, LlmClient, ModelTier } from '../ai/client';
import type { LedgerRepository } from '../ledger/repository';
import { pickModel } from '../ai/models';
import { withRetry } from './retry';

export { pickModel };

let modelsPromise: Promise<string[]> | null = null;

export async function availableModels(): Promise<string[]> {
  if (!modelsPromise) {
    modelsPromise = list()
      .then((r) => r.models.filter((m) => m.status === 'active').map((m) => m.model))
      .catch((err) => {
        modelsPromise = null;
        throw err;
      });
  }
  return modelsPromise;
}

export const forgeLlm: LlmClient = {
  async complete(tier, system, user, maxTokens = 1500) {
    const model = pickModel(await availableModels(), tier);
    if (!model) throw new Error('No Forge LLM model is available on this site');
    const res = await withRetry(
      () =>
        chat({
          model,
          temperature: 0,
          max_completion_tokens: maxTokens,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      { attempts: 3, baseMs: 800 },
    );
    const content = res.choices[0]?.message.content;
    if (typeof content === 'string') return content;
    return (content ?? []).map((p) => p.text).join('');
  },
};

export function sqlCache(repo: LedgerRepository): LlmCache {
  return { get: (h) => repo.cacheGet(h), set: (h, v) => repo.cacheSet(h, v) };
}
