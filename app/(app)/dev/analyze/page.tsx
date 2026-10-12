import { notFound } from "next/navigation";
import { DevAnalyzeForm } from "./dev-analyze-form";

// Temporary page for Giai đoạn 2–3; removed in Giai đoạn 4.
export default function DevAnalyzePage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Thử phân tích 1 ảnh</h1>
        <p className="text-sm text-muted-foreground">
          Trang tạm chỉ có ở môi trường dev. Ảnh được thu nhỏ ở trình duyệt rồi gửi lên /api/analyze. Khi chưa có
          API key, kết quả lấy từ fixture: đặt tên file chứa từ khóa (ví dụ <code>gonna</code>, <code>de-error</code>,{" "}
          <code>truncated</code>) để chọn fixture.
        </p>
      </div>
      <DevAnalyzeForm />
    </div>
  );
}
