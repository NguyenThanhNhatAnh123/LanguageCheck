/**
 * Special characters a fix adds that `original` lacks: accented or other non-ASCII letters
 * (Ä Ö Ü ß É È Ç Ñ…) and the Spanish marks ¿ ¡. The issue card then reminds the designer to
 * change the font if it cannot print them, a common reason they went missing in the first
 * place. Case-insensitive: a font with ü almost always has Ü.
 */
export function addedSpecialCharacters(original: string, replacement: string): string[] {
  const present = new Set([...original.normalize("NFC")].map((char) => char.toLowerCase()));
  const added: string[] = [];
  for (const char of replacement.normalize("NFC")) {
    if (!isSpecialCharacter(char) || present.has(char.toLowerCase()) || added.includes(char)) continue;
    added.push(char);
  }
  return added;
}

function isSpecialCharacter(char: string): boolean {
  if (char === "¿" || char === "¡") return true;
  return (char.codePointAt(0) ?? 0) > 0x7f && /\p{L}/u.test(char);
}
