import type { ModelTier } from './client';

/** Preference order per tier. The live model list decides what is actually used. */
const PREFERENCES: Record<ModelTier, RegExp[]> = {
  small: [/haiku/i, /sonnet/i],
  large: [/sonnet/i, /opus/i, /haiku/i],
};

/** Small, fast model for extraction and classification; a larger one only for final explanations. */
export function pickModel(models: string[], tier: ModelTier): string | null {
  for (const re of PREFERENCES[tier]) {
    const matches = models.filter((m) => re.test(m)).sort().reverse();
    if (matches[0]) return matches[0];
  }
  return models[0] ?? null;
}
