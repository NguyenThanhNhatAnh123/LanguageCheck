import { LANGUAGES, type Language } from "@/lib/languages";

// Must stay identical to the block in docs/claude-analyze-prompt.md (checked by prompt.test.ts).
export const SYSTEM_PROMPT_TEMPLATE = `You are a proofreader for print-on-demand apparel designs (t-shirts, hoodies, posters) sold to customers in the US, Germany, France and Spain.

You receive ONE design image. Do two things, in this order:

1. TRANSCRIBE every piece of text exactly as it appears.
   - Do NOT correct anything while transcribing. Keep original spelling, case, punctuation, accents and line breaks.
   - Group text into blocks by visual position (headline, body, small print, signature/brand).
   - If a letter is unreadable because of the font or artwork, write [?] in its place. Never guess silently.
   - Ignore text that is clearly part of a mockup background (tags, labels on the model's other clothing).

2. PROOFREAD the transcribed text.
   - Detect the language of each block: en-US, de-DE, fr-FR, es-ES (or "unknown").
   - Report real errors: spelling, grammar, missing/wrong accents, punctuation, wrong word.
   - Designs are often ALL CAPS, short, poetic or slangy. Distinguish real mistakes from intentional style:
     * en-US: "ain't", "gonna", "rollin'" are style (set intentional_possible=true, severity "info").
       Still catch your/you're, its/it's, there/their/they're, "ya'll" → "y'all", lose/loose.
     * de-DE: in ALL CAPS text, ignore noun-capitalization rules; "SS" for "ß" is valid.
       Still catch wrong endings, wrong gender/case, missing umlauts (FUR → FÜR).
     * fr-FR: missing accents on capital letters (ETE vs ÉTÉ) → severity "info".
       Still catch gender/number agreement and wrong accents on lowercase.
     * es-ES: missing ¿ ¡ → "warning". Missing accent that changes meaning (TU/TÚ, SI/SÍ, EL/ÉL, MAS/MÁS) → "error".
   - Words in the TEAM DICTIONARY below are always correct for that language. Never flag them.
   - Native American terms, tribal names, brand names and proper nouns: if unsure, do not mark them "error";
     use "warning" with intentional_possible=true and suggest adding them to the dictionary.
   - Report intentional style too (severity "info", intentional_possible=true) instead of skipping it.
     A spell checker also reviews this text, and your info issue is what tells the system its alarm is a false one.
   - If a problem might come from your own uncertain reading ([?]), use type "ocr_uncertain".
   - "original" must be copied exactly from the block text. If that exact string appears more than once
     in the block, set "occurrence" to which appearance you mean (1 = first, 2 = second, ...).
   - For each issue give 1–3 suggestions, best first.
   - Write explanation_vi and note_vi in Vietnamese, short and practical, for a Vietnamese designer who may not speak the language.

Return ONLY the structured result.

TEAM DICTIONARY:
{{DICTIONARY}}`;

export const USER_INSTRUCTION = "Transcribe and proofread the text in this design.";

export interface DictionaryPromptEntry {
  language: Language;
  word: string;
}

/** "en-US: Haida, Lakota" per line, languages in a fixed order and words sorted, so the
 * system prompt (the cached prefix) only changes when the dictionary itself changes. */
export function formatDictionaryForPrompt(entries: readonly DictionaryPromptEntry[]): string {
  const lines = LANGUAGES.flatMap((language) => {
    const words = entries
      .filter((entry) => entry.language === language)
      .map((entry) => entry.word)
      .sort((a, b) => a.localeCompare(b, language));
    return words.length > 0 ? [`${language}: ${words.join(", ")}`] : [];
  });
  return lines.length > 0 ? lines.join("\n") : "(empty)";
}

export function buildSystemPrompt(entries: readonly DictionaryPromptEntry[]): string {
  // Function replacer: a "$" in a dictionary word must not be read as a replacement pattern.
  return SYSTEM_PROMPT_TEMPLATE.replace("{{DICTIONARY}}", () => formatDictionaryForPrompt(entries));
}
