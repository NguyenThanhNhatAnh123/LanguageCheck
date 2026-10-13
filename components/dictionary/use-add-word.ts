"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { useSession } from "@/components/session/session-provider";
import { LANGUAGE_LABELS, type Language } from "@/lib/languages";

/**
 * Adds one word to the dictionary from a card: toast to confirm, with "Hoàn tác" when the
 * word is new (an already-present word is never removed by an undo). The session re-filters
 * every result itself; the undo brings the word's issues back. Resolves to true when the word is in the dictionary afterwards.
 */
export function useAddWordToDictionary() {
  const { addToDictionary, undoAddToDictionary } = useSession();

  return useCallback(
    async (word: string, language: Language, description?: string): Promise<boolean> => {
      const label = LANGUAGE_LABELS[language];
      try {
        const { created, entry } = await addToDictionary({ language, word });
        if (!created) {
          toast.info(`"${entry.word}" đã có trong từ điển ${label}`);
          return true;
        }
        toast.success(`Đã thêm "${entry.word}" vào từ điển`, {
          description: description ? `${label}. ${description}` : label,
          action: {
            label: "Hoàn tác",
            onClick: () => {
              undoAddToDictionary(entry)
                .then(() => toast(`Đã bỏ "${entry.word}" khỏi từ điển`))
                .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Không hoàn tác được."));
            },
          },
        });
        return true;
      } catch (error) {
        toast.error("Không thêm được vào từ điển", { description: error instanceof Error ? error.message : undefined });
        return false;
      }
    },
    [addToDictionary, undoAddToDictionary],
  );
}
