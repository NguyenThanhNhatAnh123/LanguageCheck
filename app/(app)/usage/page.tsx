import { ExternalLinkIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getClaudeConfig } from "@/lib/claude/config";
import {
  cacheHitRate,
  listUsageDays,
  monthUsageByModel,
  sumUsage,
  tokensPerImage,
  totalInputTokens,
  type UsageTotals,
} from "@/lib/usage";

export const metadata: Metadata = {
  title: "Chi phí · POD Text QA",
};

// Real costs (with every rate and discount applied) live in the Anthropic Console.
const CONSOLE_URL = "https://platform.claude.com/";

const exact = new Intl.NumberFormat("vi-VN");
const compact = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 1 });

const formatRate = (value: number | null) => (value === null ? "—" : percent.format(value));
const formatPerImage = (value: number | null) => (value === null ? "—" : exact.format(Math.round(value)));

export default function UsagePage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Chi phí</h1>
          <p className="text-sm text-muted-foreground">
            Số ảnh và token Claude đã dùng theo ngày (giờ máy chủ) và theo model. Chỉ có con số, không lưu ảnh hay nội dung.
            Bốn loại token tính giá khác nhau nên được tách riêng; trang này không quy ra tiền.
          </p>
        </div>
        <a
          href={CONSOLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring inline-flex items-center gap-1.5 rounded-md text-sm font-medium underline-offset-4 hover:underline"
        >
          Xem chi phí thực tế trên Anthropic Console <ExternalLinkIcon className="size-3.5" aria-hidden />
        </a>
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
  const byModel = monthUsageByModel(now);
  const month = sumUsage(byModel);
  const lastMonth = sumUsage(monthUsageByModel(new Date(now.getFullYear(), now.getMonth() - 1, 15)));
  const days = listUsageDays(62, undefined, now);
  let mock = false;
  try {
    mock = getClaudeConfig().mode === "mock";
  } catch {
    // Misconfigured production never gets here (startup stops); nothing to show.
  }
  const monthLabel = `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`;

  return (
    <div className="space-y-8">
      {mock && (
        <Notice tone="info">Đang chạy chế độ mock: các lần kiểm tra bằng dữ liệu mẫu không gọi Claude nên không được tính vào đây.</Notice>
      )}

      <section aria-label={monthLabel} className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">{monthLabel}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Ảnh đã kiểm"
            value={compact.format(month.images)}
            detail={`${formatPerImage(tokensPerImage(month))} token / ảnh · tháng trước ${compact.format(lastMonth.images)} ảnh`}
          />
          <StatTile
            label="Token vào"
            value={compact.format(totalInputTokens(month))}
            detail={`Không cache ${compact.format(month.inputTokens)} · đọc cache ${compact.format(month.cacheReadTokens)} · ghi cache ${compact.format(month.cacheWriteTokens)}`}
          />
          <StatTile label="Token ra" value={compact.format(month.outputTokens)} detail={`${exact.format(month.outputTokens)} token`} />
          <StatTile
            label="Tỉ lệ cache hit"
            value={formatRate(cacheHitRate(month))}
            detail="Phần token vào được đọc từ cache (rẻ hơn nhiều so với token thường)"
          />
        </div>
      </section>

      {byModel.length > 0 && (
        <section aria-label="Theo model" className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">{monthLabel}, theo model</h2>
          <UsageTable rows={byModel.map((row) => ({ key: row.model, first: null, ...row }))} />
        </section>
      )}

      <section aria-label="Theo ngày" className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Theo ngày (62 ngày gần nhất)</h2>
        <UsageTable rows={days.map((row) => ({ key: `${row.date}/${row.model}`, first: formatDay(row.date), ...row }))} />
      </section>
    </div>
  );
}

interface TableRowData extends UsageTotals {
  key: string;
  /** Date column, or null for the per-model table. */
  first: string | null;
  model: string;
}

function UsageTable({ rows }: { rows: TableRowData[] }) {
  const withDate = rows.some((row) => row.first !== null);
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      {rows.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">Chưa có số liệu.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {withDate && <TableHead className="pl-4">Ngày</TableHead>}
              <TableHead className={withDate ? undefined : "pl-4"}>Model</TableHead>
              <TableHead className="text-right">Ảnh</TableHead>
              <TableHead className="text-right">Vào (không cache)</TableHead>
              <TableHead className="text-right">Đọc cache</TableHead>
              <TableHead className="text-right">Ghi cache</TableHead>
              <TableHead className="text-right">Ra</TableHead>
              <TableHead className="text-right">Cache hit</TableHead>
              <TableHead className="pr-4 text-right">Token / ảnh</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {rows.map((row) => (
              <TableRow key={row.key}>
                {withDate && <TableCell className="pl-4 whitespace-nowrap">{row.first}</TableCell>}
                <TableCell className={withDate ? "font-mono text-xs" : "pl-4 font-mono text-xs"}>{row.model}</TableCell>
                <TableCell className="text-right">{exact.format(row.images)}</TableCell>
                <TableCell className="text-right">{exact.format(row.inputTokens)}</TableCell>
                <TableCell className="text-right">{exact.format(row.cacheReadTokens)}</TableCell>
                <TableCell className="text-right">{exact.format(row.cacheWriteTokens)}</TableCell>
                <TableCell className="text-right">{exact.format(row.outputTokens)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{formatRate(cacheHitRate(row))}</TableCell>
                <TableCell className="pr-4 text-right text-muted-foreground">{formatPerImage(tokensPerImage(row))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/** Stat tile: sentence-case label, compact value, the exact breakdown as context. */
function StatTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="space-y-1 rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-3xl font-semibold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function UsageSkeleton() {
  return (
    <div className="space-y-6" aria-label="Đang tải">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
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
