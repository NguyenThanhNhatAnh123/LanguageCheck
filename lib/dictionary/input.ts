import { z } from "zod";
import { LANGUAGES } from "@/lib/languages";

// One dictionary word as typed by a user (API, "Thêm vào từ điển", CSV import).
export const dictionaryWordInputSchema = z.object({
  language: z.enum(LANGUAGES),
  word: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine((word) => !/[\r\n\t]/.test(word), "Từ không được chứa xuống dòng hoặc tab"),
  note: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((note) => (note ? note : null)),
});

export type DictionaryWordInput = z.infer<typeof dictionaryWordInputSchema>;
