// Splits a multi-word issue ("petites chose", "HAIDA NATION") into the words a user can add
// to the dictionary one by one.

// Letters (with combining marks) and digits, joined by inner apostrophes or hyphens:
// keeps "YOU'RE", "rock-n-roll", "aujourd’hui" in one piece.
const WORD = /[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*/gu;

/** Distinct words (case-insensitive, first spelling kept); digit-only tokens are skipped. */
export function splitWords(text: string): string[] {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const match of text.matchAll(WORD)) {
    const word = match[0];
    const key = word.toLocaleLowerCase();
    if (/^\p{N}+$/u.test(word) || seen.has(key)) continue;
    seen.add(key);
    words.push(word);
  }
  return words;
}
