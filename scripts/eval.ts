// Runs every image listed in <dir>/expected.csv through the same pipeline as /api/analyze
// and reports how many real errors were caught and how many clean images were flagged.
//
// Usage: npm run eval                      (uses ./test-images)
//        npm run eval -- --dir <folder>    (another folder with images + expected.csv)
//
// expected.csv: header "file,expected_text,has_error" (see docs/expected.example.csv).
// Results are also saved to <dir>/eval-results/<timestamp>.json for later comparison.
// With an API key this calls Claude for real (and counts in usage_daily); without one in
// development it uses the mock fixtures, which only checks the plumbing.
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import { analyzeMockup } from "../lib/analysis/analyze-mockup";
import { getClaudeRuntime } from "../lib/claude";
import { parseCsv } from "../lib/dictionary/csv";
import { formatRate, parseExpectedError, summarize, type EvalCase } from "../lib/eval/metrics";

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

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  const dir = path.resolve(argValue("--dir") ?? "test-images");
  const csvPath = path.join(dir, "expected.csv");
  if (!fs.existsSync(csvPath)) {
    fail(`Không thấy ${csvPath}.\nTạo thư mục test-images/ gồm ảnh mockup và expected.csv (mẫu: docs/expected.example.csv).`);
  }

  const [header = [], ...rows] = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const column = (name: string) => header.findIndex((value) => value.trim().toLowerCase() === name);
  const fileIndex = column("file");
  const textIndex = column("expected_text");
  const errorIndex = column("has_error");
  if (fileIndex === -1 || errorIndex === -1) {
    fail('expected.csv cần cột "file" và "has_error" (cột "expected_text" không bắt buộc).');
  }

  const runtime = getClaudeRuntime();
  console.log(`Thư mục: ${dir}`);
  console.log(runtime.mock ? "Chế độ: MOCK (fixtures, không gọi Claude)\n" : "Chế độ: Claude thật (có tính phí, ghi vào usage_daily)\n");

  const cases: EvalCase[] = [];
  for (const [index, fields] of rows.entries()) {
    const line = index + 2;
    const file = fields[fileIndex]?.trim() ?? "";
    const expectedError = parseExpectedError(fields[errorIndex] ?? "");
    const expectedText = textIndex === -1 ? null : fields[textIndex]?.trim() || null;
    const imagePath = path.join(dir, file);
    if (!file || expectedError === null) {
      console.warn(`Dòng ${line}: thiếu tên file hoặc has_error không hợp lệ, bỏ qua.`);
      continue;
    }
    if (!fs.existsSync(imagePath)) {
      console.warn(`Dòng ${line}: không thấy file ${file}, bỏ qua.`);
      continue;
    }

    const response = await analyzeMockup(
      { data: await resizeLikeBrowser(imagePath), mediaType: "image/jpeg", fileName: file },
      runtime,
    );
    const status = response.ok ? response.result.status : null;
    const correctedText = response.ok ? response.result.blocks.map((block) => block.correctedText).join("\n") : null;
    cases.push({ file, expectedError, expectedText, status, correctedText });

    const flagged = status === "error" || status === "warning";
    const verdict = status === null ? "THẤT BẠI" : flagged === expectedError ? "đúng" : expectedError ? "BỎ SÓT" : "BÁO NHẦM";
    const got = response.ok ? response.result.status : response.error;
    console.log(`${verdict.padEnd(9)} ${file}  (mong đợi: ${expectedError ? "có lỗi" : "không lỗi"}, kết quả: ${got})`);
  }

  const summary = summarize(cases);
  console.log("\n=== Tổng kết ===");
  console.log(`Số ảnh:                      ${summary.cases} (thất bại ${summary.failed})`);
  console.log(`Tỉ lệ bắt đúng:              ${formatRate(summary.detection)}   chỉ tính "Lỗi": ${formatRate(summary.detectionStrict)}`);
  console.log(`Tỉ lệ báo nhầm:              ${formatRate(summary.falseAlarm)}   chỉ tính "Lỗi": ${formatRate(summary.falseAlarmStrict)}`);
  console.log(`Chữ sau khi sửa khớp đáp án: ${formatRate(summary.textMatch)}`);

  const outDir = path.join(dir, "eval-results");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ mock: runtime.mock, model: process.env.CLAUDE_MODEL ?? null, summary, cases }, null, 2));
  console.log(`\nĐã lưu kết quả: ${outFile}`);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
