"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LANGUAGE_LABELS, LANGUAGES, type Language } from "@/lib/languages";

const languageItems = LANGUAGES.map((code) => ({ value: code, label: `${LANGUAGE_LABELS[code]} (${code})` }));

export function LtTestForm() {
  const [text, setText] = useState("This are an test.");
  const [language, setLanguage] = useState<Language>("en-US");
  const [result, setResult] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const response = await fetch("/api/lt-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language }),
      });
      const body: unknown = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      setResult(JSON.stringify(body, null, 2));
    } catch {
      setResult(JSON.stringify({ error: "Không kết nối được máy chủ." }, null, 2));
    }
    setPending(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="lt-text">Chữ cần kiểm tra</Label>
          <Textarea
            id="lt-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={6}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Ngôn ngữ</Label>
          <Select
            items={languageItems}
            value={language}
            onValueChange={(value) => {
              if (value) setLanguage(value);
            }}
          >
            <SelectTrigger className="w-64">
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
        <Button type="submit" disabled={pending}>
          {pending ? "Đang kiểm tra..." : "Kiểm tra"}
        </Button>
      </form>
      <pre className="max-h-[70vh] overflow-auto rounded-lg border bg-muted p-4 font-mono text-xs">
        {result ?? "Kết quả sẽ hiện ở đây."}
      </pre>
    </div>
  );
}
