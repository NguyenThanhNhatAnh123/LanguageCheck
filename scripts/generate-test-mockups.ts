// Fixed synthetic test set: T-shirt mockups with known text, rendered from Windows fonts,
// plus expected.csv (with a language column) for `npm run eval`.
//
// Usage: npm run test-images                     (writes test-images/synthetic/)
//        npm run test-images -- --out <folder>
//
// The images are regenerated identically on every run, so they are not committed. Real
// mockups still matter: rendered text is easier to read than printed, photographed designs.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { Language } from "../lib/languages";

interface MockupCase {
  file: string;
  language: Language | null;
  /** Text as printed, one entry per line. Empty: a blank shirt. */
  lines: string[];
  font: string;
  weight?: "bold";
  ink: string;
  shirt?: string;
  /** Correct text when the design has an error (lines joined with \n). */
  fixed?: string;
  tilt?: number;
  distress?: boolean;
  neckTag?: boolean;
  /** Text only, transparent background (like a design file without a mockup). */
  transparent?: boolean;
}

const CASES: MockupCase[] = [
  // en-US
  { file: "en-your-the-best.png", language: "en-US", lines: ["YOUR THE BEST", "DAD EVER"], font: "Impact", ink: "#ffffff", shirt: "#1f2a44", fixed: "YOU'RE THE BEST\nDAD EVER" },
  { file: "en-gonna-rock.png", language: "en-US", lines: ["WE'RE GONNA", "ROCK TONIGHT"], font: "Arial Black", ink: "#111111", shirt: "#b9bcc0" },
  { file: "en-its-beautiful.png", language: "en-US", lines: ["ITS A BEAUTIFUL", "DAY"], font: "Georgia", weight: "bold", ink: "#2d4a22", shirt: "#f3ead7", fixed: "IT'S A BEAUTIFUL\nDAY" },
  { file: "en-happy-birthday-grandma.png", language: "en-US", lines: ["HAPPY BIRTHDAY", "GRANDMA"], font: "Comic Sans MS", weight: "bold", ink: "#c2185b", shirt: "#ffffff" },
  { file: "en-there-going.png", language: "en-US", lines: ["THERE GOING TO", "LOVE IT"], font: "Bahnschrift", weight: "bold", ink: "#ffd54f", shirt: "#263238", fixed: "THEY'RE GOING TO\nLOVE IT" },
  { file: "en-yall-tilted.png", language: "en-US", lines: ["ALL YA'LL", "ARE INVITED"], font: "Arial Black", ink: "#ffffff", shirt: "#7b1f1f", tilt: -9, fixed: "ALL Y'ALL\nARE INVITED" },
  { file: "en-proud-nurse.png", language: "en-US", lines: ["Proud to be", "a Nurse"], font: "Segoe Script", weight: "bold", ink: "#0d47a1", shirt: "#e3f2fd" },
  { file: "en-dont-loose-hope.png", language: "en-US", lines: ["DONT LOOSE", "HOPE"], font: "Impact", ink: "#f5f5f5", shirt: "#3e2723", distress: true, fixed: "DON'T LOSE\nHOPE" },
  { file: "en-best-freind.png", language: "en-US", lines: ["BEST FREIND", "EVER"], font: "Courier New", weight: "bold", ink: "#000000", shirt: "#fff59d", fixed: "BEST FRIEND\nEVER" },
  { file: "en-haida-pride.png", language: "en-US", lines: ["HAIDA NATION", "PRIDE"], font: "Times New Roman", weight: "bold", ink: "#b71c1c", shirt: "#111111" },
  { file: "en-coffee-first.png", language: "en-US", lines: ["Coffee First"], font: "Brush Script MT", ink: "#3a3a3a", shirt: "#141414" },
  { file: "en-lake-life-tag.png", language: "en-US", lines: ["LAKE LIFE"], font: "Impact", ink: "#0277bd", shirt: "#ffffff", neckTag: true },
  { file: "en-night-owl-transparent.png", language: "en-US", lines: ["NIGHT OWL"], font: "Arial Black", ink: "#ffffff", transparent: true },
  // de-DE
  { file: "de-nur-fur-dich.png", language: "de-DE", lines: ["NUR FUR DICH"], font: "Impact", ink: "#c62828", shirt: "#ffffff", fixed: "NUR FÜR DICH" },
  { file: "de-beste-mama.png", language: "de-DE", lines: ["DIE BESTE MAMA", "DER WELT"], font: "Arial Black", ink: "#ad1457", shirt: "#fce4ec" },
  { file: "de-meine-hund.png", language: "de-DE", lines: ["ICH LIEBE", "MEINE HUND"], font: "Bahnschrift", weight: "bold", ink: "#ffffff", shirt: "#33691e", fixed: "ICH LIEBE\nMEINEN HUND" },
  { file: "de-grosse-liebe.png", language: "de-DE", lines: ["GROSSE LIEBE"], font: "Georgia", weight: "bold", ink: "#4a148c", shirt: "#ede7f6" },
  { file: "de-fuer-immer.png", language: "de-DE", lines: ["FUER IMMER"], font: "Georgia", weight: "bold", ink: "#ffffff", shirt: "#37474f" },
  { file: "de-fur-immer.png", language: "de-DE", lines: ["FUR IMMER"], font: "Bahnschrift", weight: "bold", ink: "#1a237e", shirt: "#e8eaf6", fixed: "FÜR IMMER" },
  { file: "de-bester-papa.png", language: "de-DE", lines: ["BESTER PAPA", "DER WELT"], font: "Impact", ink: "#ffeb3b", shirt: "#212121" },
  // fr-FR
  { file: "fr-vive-l-ete.png", language: "fr-FR", lines: ["VIVE L'ETE"], font: "Impact", ink: "#ff6f00", shirt: "#e0f7fa" },
  { file: "fr-petites-chose.png", language: "fr-FR", lines: ["LES PETITES CHOSE", "DE LA VIE"], font: "Times New Roman", weight: "bold", ink: "#212121", shirt: "#f5f5f5", fixed: "LES PETITES CHOSES\nDE LA VIE" },
  { file: "fr-joyeux-anniversaire.png", language: "fr-FR", lines: ["Joyeux anniversaire", "maman"], font: "Segoe Print", weight: "bold", ink: "#6a1b9a", shirt: "#fff8e1" },
  { file: "fr-bonne-fete.png", language: "fr-FR", lines: ["Bonne fete", "papa"], font: "Lucida Handwriting", ink: "#ffffff", shirt: "#01579b", fixed: "Bonne fête\npapa" },
  { file: "fr-maman-parfait.png", language: "fr-FR", lines: ["MAMAN", "PARFAIT"], font: "Comic Sans MS", weight: "bold", ink: "#880e4f", shirt: "#f8bbd0", fixed: "MAMAN\nPARFAITE" },
  // es-ES
  { file: "es-tu-eres.png", language: "es-ES", lines: ["TU ERES", "MI VIDA"], font: "Arial Black", ink: "#d32f2f", shirt: "#fafafa", fixed: "TÚ ERES\nMI VIDA" },
  { file: "es-feliz-cumple.png", language: "es-ES", lines: ["¡FELIZ", "CUMPLEAÑOS!"], font: "Comic Sans MS", weight: "bold", ink: "#ffeb3b", shirt: "#283593" },
  { file: "es-mejor-abuela.png", language: "es-ES", lines: ["LA MEJOR ABUELA", "DEL MUNDO"], font: "Georgia", weight: "bold", ink: "#1b5e20", shirt: "#ffffff" },
  { file: "es-feliz-ano-nuevo.png", language: "es-ES", lines: ["FELIZ ANO", "NUEVO"], font: "Arial Black", ink: "#ffd700", shirt: "#0d1b3e", fixed: "FELIZ AÑO\nNUEVO" },
  { file: "es-abuela-orgulloso.png", language: "es-ES", lines: ["ABUELA", "ORGULLOSO"], font: "Times New Roman", weight: "bold", ink: "#4e342e", shirt: "#ffe0b2", fixed: "ABUELA\nORGULLOSA" },
  // No text
  { file: "blank-shirt.png", language: null, lines: [], font: "Impact", ink: "#000000", shirt: "#90a4ae" },
];

const WIDTH = 1200;
const HEIGHT = 1400;
const SHIRT_PATH = "M 300 200 L 480 140 Q 600 230 720 140 L 900 200 L 1100 420 L 960 520 L 900 470 L 900 1300 L 300 1300 L 300 470 L 240 520 L 100 420 Z";
/** Rough average glyph width / font size, to fit the longest line in ~540px. */
const WIDTH_FACTOR: Record<string, number> = {
  Impact: 0.48,
  "Arial Black": 0.74,
  Georgia: 0.62,
  "Comic Sans MS": 0.6,
  "Segoe Script": 0.64,
  "Courier New": 0.62,
  "Times New Roman": 0.68,
  "Lucida Handwriting": 0.7,
  "Segoe Print": 0.62,
  Bahnschrift: 0.54,
  "Brush Script MT": 0.46,
};

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Deterministic pseudo-random numbers, so the distress pattern is identical on every run. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function textSvg(c: MockupCase): string {
  if (c.lines.length === 0) return "";
  const longest = Math.max(...c.lines.map((line) => line.length));
  const size = Math.round(Math.min(118, 540 / (longest * (WIDTH_FACTOR[c.font] ?? 0.6))));
  const lineHeight = size * 1.18;
  const top = 640 - ((c.lines.length - 1) * lineHeight) / 2 + size * 0.35;
  const attributes = `font-family="${c.font}" font-size="${size}" fill="${c.ink}" text-anchor="middle"${c.weight ? ` font-weight="${c.weight}"` : ""}`;
  const lines = c.lines.map((line, i) => `<text x="600" y="${top + i * lineHeight}" ${attributes}>${escapeXml(line)}</text>`).join("");
  return c.tilt ? `<g transform="rotate(${c.tilt} 600 640)">${lines}</g>` : lines;
}

function distressSvg(c: MockupCase): string {
  if (!c.distress || !c.shirt) return "";
  const next = random(42);
  let dots = "";
  for (let i = 0; i < 900; i++) {
    dots += `<circle cx="${(330 + next() * 540).toFixed(1)}" cy="${(470 + next() * 340).toFixed(1)}" r="${(1 + next() * 4).toFixed(1)}" fill="${c.shirt}"/>`;
  }
  return dots;
}

function neckTagSvg(c: MockupCase): string {
  if (!c.neckTag) return "";
  return `<rect x="548" y="172" width="104" height="46" fill="#fafafa" stroke="#bbb"/>
    <text x="600" y="191" font-family="Arial" font-size="13" fill="#333" text-anchor="middle">SIZE M</text>
    <text x="600" y="209" font-family="Arial" font-size="11" fill="#333" text-anchor="middle">100% COTTON</text>`;
}

function mockupSvg(c: MockupCase): string {
  if (c.transparent) return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${textSvg(c)}</svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
    <rect width="100%" height="100%" fill="#ece9e4"/>
    <path d="${SHIRT_PATH}" fill="${c.shirt ?? "#ffffff"}" stroke="rgba(0,0,0,0.18)" stroke-width="3"/>
    ${neckTagSvg(c)}${textSvg(c)}${distressSvg(c)}
  </svg>`;
}

const csvField = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

async function main(): Promise<void> {
  const outIndex = process.argv.indexOf("--out");
  const outDir = path.resolve(outIndex === -1 ? "test-images/synthetic" : process.argv[outIndex + 1]);
  fs.mkdirSync(outDir, { recursive: true });

  const rows = ["file,expected_text,has_error,language"];
  for (const c of CASES) {
    await sharp(Buffer.from(mockupSvg(c))).png().toFile(path.join(outDir, c.file));
    const expected = c.fixed ?? c.lines.join("\n");
    rows.push([c.file, csvField(expected), c.fixed ? "yes" : "no", c.language ?? ""].join(","));
  }
  fs.writeFileSync(path.join(outDir, "expected.csv"), rows.join("\n") + "\n");

  // Contact sheet for a quick visual check (not listed in expected.csv).
  const thumbs = await Promise.all(
    CASES.map((c) => sharp(path.join(outDir, c.file)).flatten({ background: "#808080" }).resize(240, 280).png().toBuffer()),
  );
  const columns = 6;
  await sharp({ create: { width: columns * 240, height: Math.ceil(CASES.length / columns) * 280, channels: 3, background: "#ffffff" } })
    .composite(thumbs.map((input, i) => ({ input, left: (i % columns) * 240, top: Math.floor(i / columns) * 280 })))
    .png()
    .toFile(path.join(outDir, "_contact-sheet.png"));

  const withError = CASES.filter((c) => c.fixed).length;
  console.log(`Đã tạo ${CASES.length} mockup (${withError} có lỗi, ${CASES.length - withError} không lỗi) + expected.csv trong ${outDir}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
