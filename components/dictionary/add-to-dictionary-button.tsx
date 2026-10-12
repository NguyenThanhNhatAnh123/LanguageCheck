"use client";

import { BookPlusIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Language } from "@/lib/languages";
import { useAddWordToDictionary } from "./use-add-word";

/** "Thêm vào từ điển" for a single word flagged by mistake. */
export function AddToDictionaryButton({ word, language }: { word: string; language: Language }) {
  const addWord = useAddWordToDictionary();
  const [pending, setPending] = useState(false);

  async function add() {
    setPending(true);
    await addWord(word, language, "Lỗi này sẽ không bị báo nữa.");
    setPending(false);
  }

  return (
    <Button variant="ghost" size="xs" onClick={add} disabled={pending} className="text-muted-foreground">
      {pending ? <Loader2Icon className="animate-spin" /> : <BookPlusIcon />}
      Thêm vào từ điển
    </Button>
  );
}
