"use client";

import { BookPlusIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/components/session/session-provider";
import { Button } from "@/components/ui/button";
import { LANGUAGE_LABELS, type Language } from "@/lib/languages";

/**
 * "Thêm vào từ điển" for a word flagged by mistake. Saves it right away; every result in
 * the session is re-filtered (the issue disappears), and the toast offers "Hoàn tác".
 */
export function AddToDictionaryButton({ word, language }: { word: string; language: Language }) {
  const session = useSession();
  const [pending, setPending] = useState(false);
  const label = LANGUAGE_LABELS[language];

  async function add() {
    setPending(true);
    try {
      const { created, entry } = await session.addToDictionary({ language, word });
      if (!created) {
        toast.info(`"${entry.word}" đã có trong từ điển ${label}`);
        return;
      }
      toast.success(`Đã thêm "${entry.word}" vào từ điển`, {
        description: `${label}. Lỗi này sẽ không bị báo nữa.`,
        action: {
          label: "Hoàn tác",
          onClick: () => {
            session
              .removeFromDictionary(entry.id)
              .then(() => toast(`Đã bỏ "${entry.word}" khỏi từ điển`))
              .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Không hoàn tác được."));
          },
        },
      });
    } catch (error) {
      toast.error("Không thêm được vào từ điển", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="ghost" size="xs" onClick={add} disabled={pending} className="text-muted-foreground">
      {pending ? <Loader2Icon className="animate-spin" /> : <BookPlusIcon />}
      Thêm vào từ điển
    </Button>
  );
}
