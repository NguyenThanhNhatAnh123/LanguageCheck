import type { Metadata } from "next";
import { DictionaryManager } from "@/components/dictionary/dictionary-manager";

export const metadata: Metadata = {
  title: "Từ điển · POD Text QA",
};

export default function DictionaryPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Từ điển</h1>
        <p className="text-sm text-muted-foreground">
          Từ trong từ điển không bao giờ bị báo lỗi ở đúng ngôn ngữ đó, không phân biệt hoa thường (ở tiếng Đức, ß và ss
          coi là một).
        </p>
      </div>
      <DictionaryManager />
    </div>
  );
}
