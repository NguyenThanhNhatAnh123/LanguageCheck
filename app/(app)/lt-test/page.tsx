import { notFound } from "next/navigation";
import { LtTestForm } from "./lt-test-form";

export default function LtTestPage() {
  // Top-level check so production returns a real 404 status.
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Thử LanguageTool</h1>
        <p className="text-sm text-muted-foreground">
          Trang này chỉ có ở môi trường dev. Kết quả là JSON gốc LanguageTool trả về.
        </p>
      </div>
      <LtTestForm />
    </div>
  );
}
