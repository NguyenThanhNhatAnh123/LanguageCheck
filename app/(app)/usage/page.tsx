import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getClaudeConfig } from "@/lib/claude/config";
import { listUsageDays, monthTotals } from "@/lib/usage";

export const metadata: Metadata = {
  title: "Chi phí · POD Text QA",
};

const exact = new Intl.NumberFormat("vi-VN");
const compact = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });

export default function UsagePage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Chi phí</h1>
        <p className="text-sm text-muted-foreground">
          Số ảnh và token Claude đã dùng theo ngày (giờ máy chủ). Chỉ có con số, không lưu ảnh hay nội dung. Token vào gồm cả
          token đọc/ghi cache; giới hạn chi tiêu thật đặt trên Anthropic Console.
        </p>
      </div>
      {/* Reads SQLite per request, so it streams in behind a boundary. */}
      <Suspense fallback={<UsageSkeleton />}>
        <UsageContent />
      </Suspense>
    </div>
  );
}

async function UsageContent() {
  await connection();
  const now = new Date();
  const thisMonth = monthTotals(now);
  const lastMonth = monthTotals(new Date(now.getFullYear(), now.getMonth() - 1, 15));
  const days = listUsageDays(62);
  let mock = false;
  try {
    mock = getClaudeConfig().mode === "mock";
  } catch {
    // Misconfigured production never gets here (startup stops); nothing to show.
  }

  return (
    <div className="space-y-6">
      {mock && (
        <Notice tone="info">Đang chạy chế độ mock: các lần kiểm tra bằng dữ liệu mẫu không gọi Claude nên không được tính vào đây.</Notice>
      )}

      <section aria-label={`Tháng ${now.getMonth() + 1}/${now.getFullYear()}`} className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Tháng {now.getMonth() + 1}/{now.getFullYear()}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Ảnh đã kiểm" value={thisMonth.images} previous={lastMonth.images} unit="ảnh" />
          <StatTile label="Token vào" value={thisMonth.inputTokens} previous={lastMonth.inputTokens} unit="token" />
          <StatTile label="Token ra" value={thisMonth.outputTokens} previous={lastMonth.outputTokens} unit="token" />
        </div>
      </section>

      <section aria-label="Theo ngày" className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Theo ngày (62 ngày gần nhất)</h2>
        <div className="overflow-hidden rounded-xl border bg-card">
          {days.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">Chưa có số liệu.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Ngày</TableHead>
                  <TableHead className="text-right">Ảnh</TableHead>
                  <TableHead className="text-right">Token vào</TableHead>
                  <TableHead className="text-right">Token ra</TableHead>
                  <TableHead className="pr-4 text-right">Token / ảnh</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="tabular-nums">
                {days.map((day) => (
                  <TableRow key={day.date}>
                    <TableCell className="pl-4">{formatDay(day.date)}</TableCell>
                    <TableCell className="text-right">{exact.format(day.images)}</TableCell>
                    <TableCell className="text-right">{exact.format(day.inputTokens)}</TableCell>
                    <TableCell className="text-right">{exact.format(day.outputTokens)}</TableCell>
                    <TableCell className="pr-4 text-right text-muted-foreground">
                      {day.images > 0 ? exact.format(Math.round((day.inputTokens + day.outputTokens) / day.images)) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}

/** Stat tile: sentence-case label, compact value, exact figure and last month as context. */
function StatTile({ label, value, previous, unit }: { label: string; value: number; previous: number; unit: string }) {
  return (
    <div className="space-y-1 rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-3xl font-semibold tracking-tight" title={`${exact.format(value)} ${unit}`}>
        {compact.format(value)}
      </p>
      <p className="text-xs text-muted-foreground">
        {exact.format(value)} {unit} · tháng trước {compact.format(previous)}
      </p>
    </div>
  );
}

function UsageSkeleton() {
  return (
    <div className="space-y-6" aria-label="Đang tải">
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

function formatDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

