const ARABIC_DIACRITICS = /[ً-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;

/**
 * Normalizes Arabic/English text so search is forgiving:
 * lowercases, strips diacritics + tatweel, unifies alef/ya/ta-marbuta variants.
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(ARABIC_DIACRITICS, '')
    .replace(TATWEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Unique, normalized search tokens (min length 2) extracted from any number of strings. */
export function tokenize(...inputs: Array<string | undefined | null>): string[] {
  const tokens = new Set<string>();
  for (const input of inputs) {
    if (!input) continue;
    for (const token of normalizeText(input).split(/[\s-]+/)) {
      if (token.length >= 2) tokens.add(token);
    }
  }
  return [...tokens];
}

export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
