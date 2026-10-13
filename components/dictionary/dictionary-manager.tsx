"use client";

import { DownloadIcon, Loader2Icon, PlusIcon, SearchIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/notice";
import { useSession } from "@/components/session/session-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DictionaryEntryDto } from "@/lib/dictionary/dto";
import { toWordKey } from "@/lib/dictionary/word-key";
import { LANGUAGE_LABELS, LANGUAGES, type Language } from "@/lib/languages";
import { cn } from "@/lib/utils";

const languageItems = LANGUAGES.map((code) => ({ value: code, label: LANGUAGE_LABELS[code] }));

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Đã có lỗi xảy ra.";
}

export function DictionaryManager() {
  const { dictionary, refreshDictionary, addToDictionary, removeFromDictionary, importDictionary } = useSession();
  const entries = dictionary.entries;

  const [filter, setFilter] = useState<Language | "all">("all");
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<Language>("de-DE");
  const [word, setWord] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refreshDictionary();
  }, [refreshDictionary]);

  const counts = useMemo(() => {
    const result = new Map<Language, number>();
    for (const entry of entries ?? []) result.set(entry.language, (result.get(entry.language) ?? 0) + 1);
    return result;
  }, [entries]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (entries ?? []).filter(
      (entry) =>
        (filter === "all" || entry.language === filter) &&
        (needle === "" || entry.word.toLocaleLowerCase().includes(needle) || (entry.note ?? "").toLocaleLowerCase().includes(needle)),
    );
  }, [entries, filter, query]);

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!word.trim()) return;
    setAdding(true);
    try {
      const { created, entry } = await addToDictionary({ language, word, note });
      if (created) {
        toast.success(`Đã thêm "${entry.word}"`, { description: LANGUAGE_LABELS[entry.language] });
        setWord("");
        setNote("");
      } else {
        toast.info(`"${entry.word}" đã có trong từ điển ${LANGUAGE_LABELS[entry.language]}`);
      }
    } catch (error) {
      toast.error("Không thêm được", { description: errorMessage(error) });
    } finally {
      setAdding(false);
    }
  }

  async function onDelete(entry: DictionaryEntryDto) {
    try {
      await removeFromDictionary(entry.id);
      toast(`Đã xóa "${entry.word}"`, {
        description: LANGUAGE_LABELS[entry.language],
        action: {
          label: "Hoàn tác",
          onClick: () => {
            addToDictionary({ language: entry.language, word: entry.word, note: entry.note })
              .then(() => toast.success(`Đã khôi phục "${entry.word}"`))
              .catch((error: unknown) => toast.error("Không hoàn tác được", { description: errorMessage(error) }));
          },
        },
      });
    } catch (error) {
      toast.error("Không xóa được", { description: errorMessage(error) });
    }
  }

  async function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const result = await importDictionary(file);
      const invalid =
        result.invalidLines.length > 0
          ? ` ${result.invalidLines.length} dòng lỗi (dòng ${result.invalidLines.slice(0, 5).join(", ")}${result.invalidLines.length > 5 ? ", …" : ""}).`
          : "";
      toast.success(`Đã nhập ${result.created} từ mới`, {
        description: `${result.existing} từ đã có sẵn nên bỏ qua.${invalid}`,
      });
    } catch (error) {
      toast.error("Không nhập được file CSV", { description: errorMessage(error) });
    } finally {
      setImporting(false);
    }
  }

  // Warn early if the word is already there (same language, same word_key).
  const duplicate = useMemo(() => {
    const trimmed = word.trim();
    if (!trimmed || !entries) return null;
    const key = toWordKey(trimmed, language);
    return entries.find((entry) => entry.language === language && entry.wordKey === key) ?? null;
  }, [entries, word, language]);

  return (
    <div className="space-y-6">
      <form onSubmit={onAdd} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[11rem_1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label>Ngôn ngữ</Label>
          <Select
            items={languageItems}
            value={language}
            onValueChange={(value) => {
              if (value) setLanguage(value);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languageItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dictionary-word">Từ</Label>
          <Input id="dictionary-word" value={word} onChange={(event) => setWord(event.target.value)} placeholder="Ví dụ: Haida" className="font-mono" maxLength={100} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dictionary-note">Ghi chú</Label>
          <Input id="dictionary-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Không bắt buộc" maxLength={500} />
        </div>
        <Button type="submit" disabled={adding || !word.trim()}>
          {adding ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Thêm
        </Button>
        {duplicate && (
          <p className="text-xs text-amber-700 sm:col-span-4 dark:text-amber-400">
            &quot;{duplicate.word}&quot; đã có trong từ điển {LANGUAGE_LABELS[duplicate.language]}.
          </p>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Lọc theo ngôn ngữ">
          {(["all", ...LANGUAGES] as const).map((code) => {
            const active = filter === code;
            const count = code === "all" ? (entries?.length ?? 0) : (counts.get(code) ?? 0);
            return (
              <button
                key={code}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(code)}
                className={cn(
                  "focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors duration-150",
                  active ? "border-foreground/20 bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {code === "all" ? "Tất cả" : code}
                <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="relative ml-auto w-full sm:w-56">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm từ hoặc ghi chú" className="pl-8" aria-label="Tìm trong từ điển" />
        </div>
      </div>

      {dictionary.error && <Notice tone="error">Không tải được từ điển: {dictionary.error}</Notice>}

      <div className="overflow-hidden rounded-xl border bg-card">
        {entries === null ? (
          <div className="space-y-3 p-4" aria-label="Đang tải">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-6 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            {entries.length === 0
              ? "Từ điển đang trống. Thêm tên riêng, tên bộ tộc, thương hiệu… để chúng không bị báo lỗi nữa."
              : "Không có từ nào khớp bộ lọc."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Từ</TableHead>
                <TableHead>Ngôn ngữ</TableHead>
                <TableHead>Ghi chú</TableHead>
                <TableHead className="text-right">Ngày thêm</TableHead>
                <TableHead className="w-12 pr-4">
                  <span className="sr-only">Xóa</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="pl-4 font-mono">{entry.word}</TableCell>
                  <TableCell className="text-muted-foreground">{LANGUAGE_LABELS[entry.language]}</TableCell>
                  <TableCell className="max-w-64 truncate text-muted-foreground" title={entry.note ?? undefined}>
                    {entry.note ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {new Date(entry.createdAt).toLocaleDateString("vi-VN")}
                  </TableCell>
                  <TableCell className="pr-4">
                    <Button variant="ghost" size="icon-sm" onClick={() => void onDelete(entry)} aria-label={`Xóa "${entry.word}"`} title="Xóa">
                      <Trash2Icon />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Button variant="outline" size="sm" disabled={importing} onClick={() => importInput.current?.click()}>
          {importing ? <Loader2Icon className="animate-spin" /> : <UploadIcon />} Nhập CSV
        </Button>
        <a href="/api/dictionary/export" download className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <DownloadIcon /> Xuất CSV
        </a>
        <span>
          File CSV có dòng đầu <code className="font-mono text-xs">language,word,note</code>, ví dụ{" "}
          <code className="font-mono text-xs">de-DE,Haida,tên bộ tộc</code>. Từ đã có sẵn sẽ được bỏ qua.
        </span>
        <input ref={importInput} type="file" accept=".csv,text/csv" className="hidden" onChange={onImport} />
      </div>
    </div>
  );
}
