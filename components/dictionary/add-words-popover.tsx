"use client";

import { BookPlusIcon, CheckIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/session/session-provider";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { toWordKey } from "@/lib/dictionary/word-key";
import { LANGUAGE_LABELS, type Language } from "@/lib/languages";
import { cn } from "@/lib/utils";
import { useAddWordToDictionary } from "./use-add-word";

/**
 * "Thêm từng từ…" for an issue spanning several words: a chip per word, each added on its
 * own (with the same confirm/undo toast). Words already in the dictionary show a check.
 */
export function AddWordsPopover({ words, language }: { words: string[]; language: Language }) {
  const { dictionary, refreshDictionary } = useSession();
  const addWord = useAddWordToDictionary();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  // The chips need to know which words are already there.
  useEffect(() => {
    if (open && dictionary.entries === null) void refreshDictionary();
  }, [open, dictionary.entries, refreshDictionary]);

  const present = useMemo(
    () => new Set((dictionary.entries ?? []).filter((entry) => entry.language === language).map((entry) => entry.wordKey)),
    [dictionary.entries, language],
  );

  async function pick(word: string) {
    setPending(word);
    await addWord(word, language);
    setPending(null);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="xs" className="text-muted-foreground" />}>
        <BookPlusIcon /> Thêm từng từ…
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>Thêm từ vào từ điển</PopoverTitle>
          <PopoverDescription>{LANGUAGE_LABELS[language]}. Chọn từ bị báo nhầm (tên riêng, thương hiệu…).</PopoverDescription>
        </PopoverHeader>
        <div className="flex flex-wrap gap-1.5" data-testid="word-chips">
          {words.map((word) => {
            const inDictionary = present.has(toWordKey(word, language));
            const busy = pending === word;
            return (
              <button
                key={word}
                type="button"
                disabled={inDictionary || pending !== null}
                onClick={() => void pick(word)}
                aria-label={inDictionary ? `"${word}" đã có trong từ điển` : `Thêm "${word}" vào từ điển`}
                className={cn(
                  "focus-ring inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-xs transition-colors duration-150",
                  inDictionary
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "hover:bg-muted disabled:opacity-50",
                )}
              >
                {inDictionary ? (
                  <CheckIcon className="size-3" aria-hidden />
                ) : busy ? (
                  <Loader2Icon className="size-3 animate-spin" aria-hidden />
                ) : (
                  <PlusIcon className="size-3" aria-hidden />
                )}
                {word}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
