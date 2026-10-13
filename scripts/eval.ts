// Runs every image listed in <dir>/expected.csv through the same pipeline as /api/analyze
// and reports how many real errors were caught and how many clean images were flagged,
// overall and per language, with time and tokens per image.
//
// Usage: npm run eval                                   (uses ./test-images)
//        npm run eval -- --dir test-images/synthetic    (the fixed synthetic set, see npm run test-images)
//        npm run eval -- --verbose                      (also print what Claude read and the issues)
//
// expected.csv: header "file,expected_text,has_error[,language][,must_error][,source]" (see docs/expected.example.csv).
// source = "claude-draft" marks answers Claude Code wrote by reading the image: unconfirmed, so
// the run warns and its verdict is only provisional until they are replaced by the design text.
// The run ends with the pass criteria (PLAN.md "Tiêu chí đạt"): ĐẠT/TRƯỢT per language, failing cases listed.
// Results are also saved to <dir>/eval-results/<timestamp>.json for later comparison.
// With an API key this calls Claude for real (and counts in usage_daily); without one in
// development it uses the mock fixtures, which only checks the plumbing.
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import type { AnalyzeApiResponse } from "../lib/analysis/api-types";
import type { LtStatus } from "../lib/analysis/types";
import { analyzeMockup } from "../lib/analysis/analyze-mockup";
import { getClaudeRuntime } from "../lib/claude";
import { parseCsv } from "../lib/dictionary/csv";
import { evaluateCriteria, formatRate, parseExpectedError, summarize, summarizeByLanguage, type EvalCase, type EvalSummary } from "../lib/eval/metrics";

// lib/ reads env lazily (on first use), so loading it here, after the imports, is enough.
loadEnvConfig(process.cwd());

/** Same as the browser: longest side ≤ 1000px, JPEG ~0.85, transparency on mid-gray. */
function resizeLikeBrowser(file: string): Promise<Buffer> {
  return sharp(file)
    .rotate()
    .flatten({ background: "#808080" })
    .resize(1000, 1000, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/** expected.csv "source" value for answers Claude Code drafted from the image (unconfirmed). */
const DRAFT_SOURCE = "claude-draft";

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

interface CaseRun extends EvalCase {
  ms: number;
  model: string | null;
  attempts: number;
  tokens: { input: number; cacheRead: number; cacheWrite: number; output: number } | null;
  /** LanguageTool for this image: online, offline (Claude only) or skipped (no known language). */
  ltStatus: LtStatus | null;
}

function printVerbose(response: AnalyzeApiResponse): void {
  if (!response.ok) return;
  console.log(`      LanguageTool: ${response.result.ltStatus}`);
  for (const block of response.result.blocks) {
    const sentToLt = response.input.claude.blocks[block.index]?.normal_case;
    if (sentToLt) console.log(`      (bản chữ thường cho LanguageTool: ${JSON.stringify(sentToLt)})`);
    const corrected = block.correctedText !== block.text ? `  →  ${JSON.stringify(block.correctedText)}` : "";
    console.log(`      [${block.language}] ${JSON.stringify(block.text)}${corrected}`);
  }
  for (const issue of response.result.issues) {
    const suggestions = issue.suggestions.map((s) => s.text).join(" | ") || "(không có)";
    const intentional = issue.intentionalPossible ? " (có thể cố ý)" : "";
    console.log(`      - ${issue.severity.padEnd(7)} ${issue.sources.join("+").padEnd(9)} ${JSON.stringify(issue.original)} → ${suggestions}${intentional}`);
  }
}

function summaryLine(label: string, summary: EvalSummary): string {
  return [
    label.padEnd(12),
    String(summary.cases).padStart(4),
    formatRate(summary.detection).padEnd(18),
    formatRate(summary.detectionStrict).padEnd(18),
    formatRate(summary.falseAlarm).padEnd(18),
    formatRate(summary.falseAlarmStrict).padEnd(18),
    formatRate(summary.textMatch),
  ].join("  ");
}

async function main(): Promise<void> {
  const dir = path.resolve(argValue("--dir") ?? "test-images");
  const verbose = process.argv.includes("--verbose");
  const csvPath = path.join(dir, "expected.csv");
  if (!fs.existsSync(csvPath)) {
    fail(`Không thấy ${csvPath}.\nTạo thư mục test-images/ gồm ảnh mockup và expected.csv (mẫu: docs/expected.example.csv), hoặc chạy npm run test-images để tạo bộ ảnh tổng hợp.`);
  }

  const [header = [], ...rows] = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const column = (name: string) => header.findIndex((value) => value.trim().toLowerCase() === name);
  const fileIndex = column("file");
  const textIndex = column("expected_text");
  const errorIndex = column("has_error");
  const languageIndex = column("language");
  const mustErrorIndex = column("must_error");
  const sourceIndex = column("source");
  const draftRows = sourceIndex === -1 ? 0 : rows.filter((fields) => fields[sourceIndex]?.trim().toLowerCase() === DRAFT_SOURCE).length;
  const draftWarning = `CẢNH BÁO: ${draftRows}/${rows.length} dòng đáp án là bản nháp Claude soạn (source = ${DRAFT_SOURCE}), chưa được xác nhận. Kết luận chỉ là tạm thời.`;
  if (fileIndex === -1 || errorIndex === -1) {
    fail('expected.csv cần cột "file" và "has_error" (cột "expected_text" và "language" không bắt buộc).');
  }

  if (draftRows > 0) console.log(draftWarning);
  const runtime = getClaudeRuntime();
  const effort = process.env.CLAUDE_ANALYZE_EFFORT || "low";
  console.log(`Thư mục: ${dir}`);
  console.log(runtime.mock ? "Chế độ: MOCK (fixtures, không gọi Claude)\n" : `Chế độ: Claude thật, ${runtime.model}, effort ${effort} (có tính phí, ghi vào usage_daily)\n`);

  const cases: CaseRun[] = [];
  for (const [index, fields] of rows.entries()) {
    const line = index + 2;
    const file = fields[fileIndex]?.trim() ?? "";
    const expectedError = parseExpectedError(fields[errorIndex] ?? "");
    const expectedText = textIndex === -1 ? null : fields[textIndex]?.trim() || null;
    const language = languageIndex === -1 ? null : fields[languageIndex]?.trim() || null;
    const mustBeError = mustErrorIndex !== -1 && parseExpectedError(fields[mustErrorIndex] ?? "") === true;
    const imagePath = path.join(dir, file);
    if (!file || expectedError === null) {
      console.warn(`Dòng ${line}: thiếu tên file hoặc has_error không hợp lệ, bỏ qua.`);
      continue;
    }
    if (!fs.existsSync(imagePath)) {
      console.warn(`Dòng ${line}: không thấy file ${file}, bỏ qua.`);
      continue;
    }

    const startedAt = Date.now();
    const response = await analyzeMockup(
      { data: await resizeLikeBrowser(imagePath), mediaType: "image/jpeg", fileName: file },
      runtime,
    );
    const ms = Date.now() - startedAt;
    const status = response.ok ? response.result.status : null;
    const correctedText = response.ok ? response.result.blocks.map((block) => block.correctedText).join("\n") : null;
    const tokens = response.ok
      ? {
          input: response.usage.inputTokens,
          cacheRead: response.usage.cacheReadInputTokens,
          cacheWrite: response.usage.cacheCreationInputTokens,
          output: response.usage.outputTokens,
        }
      : null;
    cases.push({ file, expectedError, expectedText, status, correctedText, language, mustBeError, ms, model: response.ok ? response.model : null, attempts: response.attempts, tokens, ltStatus: response.ok ? response.result.ltStatus : null });

    const flagged = status === "error" || status === "warning";
    const verdict = status === null ? "THẤT BẠI" : flagged === expectedError ? "đúng" : expectedError ? "BỎ SÓT" : "BÁO NHẦM";
    const got = response.ok ? response.result.status : response.error;
    const lang = language ? `[${language}] ` : "";
    console.log(`${verdict.padEnd(9)} ${lang}${file}  (mong đợi: ${expectedError ? "có lỗi" : "không lỗi"}, kết quả: ${got}, ${(ms / 1000).toFixed(1)}s)`);
    if (verbose) printVerbose(response);
  }

  const summary = summarize(cases);
  const byLanguage = summarizeByLanguage(cases);
  const done = cases.filter((c) => c.tokens !== null);
  const average = (pick: (c: CaseRun) => number) => (done.length === 0 ? 0 : Math.round(done.reduce((sum, c) => sum + pick(c), 0) / done.length));
  const averages = {
    ms: average((c) => c.ms),
    input: average((c) => c.tokens?.input ?? 0),
    cacheRead: average((c) => c.tokens?.cacheRead ?? 0),
    cacheWrite: average((c) => c.tokens?.cacheWrite ?? 0),
    output: average((c) => c.tokens?.output ?? 0),
  };
  const retried = cases.filter((c) => c.attempts > 1).length;
  const ltCount = (status: LtStatus) => cases.filter((c) => c.ltStatus === status).length;

  console.log("\n=== Tổng kết ===");
  console.log(`Số ảnh:                      ${summary.cases} (thất bại ${summary.failed}, phải gọi lại ${retried})`);
  console.log(`LanguageTool:                chạy ${ltCount("online")}, lỗi/tắt ${ltCount("offline")}, bỏ qua (không rõ ngôn ngữ / không có chữ) ${ltCount("skipped")}`);
  if (ltCount("offline") > 0) console.log("  CẢNH BÁO: có ảnh chỉ được Claude kiểm, kết quả không đại diện cho tool khi LanguageTool chạy.");
  console.log(`Tỉ lệ bắt đúng:              ${formatRate(summary.detection)}   chỉ tính "Lỗi": ${formatRate(summary.detectionStrict)}`);
  console.log(`Tỉ lệ báo nhầm:              ${formatRate(summary.falseAlarm)}   chỉ tính "Lỗi": ${formatRate(summary.falseAlarmStrict)}`);
  console.log(`Chữ sau khi sửa khớp đáp án: ${formatRate(summary.textMatch)}`);
  console.log(`Trung bình mỗi ảnh:          ${(averages.ms / 1000).toFixed(1)}s, token vào ${averages.input} + đọc cache ${averages.cacheRead} + ghi cache ${averages.cacheWrite}, token ra ${averages.output}`);

  console.log("\n=== Theo ngôn ngữ ===");
  console.log(["Ngôn ngữ".padEnd(12), " Ảnh", "Bắt đúng".padEnd(18), "  chỉ tính Lỗi".padEnd(18), "Báo nhầm".padEnd(18), "  chỉ tính Lỗi".padEnd(18), "Chữ sửa khớp"].join("  "));
  for (const group of byLanguage) console.log(summaryLine(group.language, group.summary));

  const criteria = evaluateCriteria(cases, averages.ms);
  console.log("\n=== Tiêu chí đạt ===");
  for (const group of criteria.byLanguage) {
    console.log(`${group.language}: ${group.pass ? "ĐẠT" : "TRƯỢT"}`);
    for (const result of group.criteria) {
      console.log(`  ${result.pass ? "✓" : "✗"} ${result.label}`);
      for (const failure of result.failures) console.log(`      - ${failure}`);
    }
  }
  for (const result of criteria.overall) {
    console.log(`${result.pass ? "✓" : "✗"} ${result.label} (${(averages.ms / 1000).toFixed(1)} s)`);
  }
  console.log(criteria.pass ? "KẾT LUẬN: ĐẠT" : "KẾT LUẬN: TRƯỢT");
  if (draftRows > 0) console.log(draftWarning);

  const outDir = path.join(dir, "eval-results");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify({ mock: runtime.mock, model: runtime.mock ? null : runtime.model, effort, draftRows, summary, byLanguage, criteria, averages, cases }, null, 2),
  );
  console.log(`\nĐã lưu kết quả: ${outFile}`);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
