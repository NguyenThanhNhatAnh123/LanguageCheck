// Prints APP_PASSWORD_HASH_B64 for .env.local.
// Usage: npm run hash-password   (prompts for the password, input hidden)
// The bcrypt hash is base64-encoded because Next.js expands `$` in .env files.
import { createInterface } from "node:readline";
import { hash } from "bcryptjs";

const BCRYPT_COST = 12;
const MIN_LENGTH = 8;
const BCRYPT_MAX_BYTES = 72;

async function main(): Promise<void> {
  let password: string;
  if (process.stdin.isTTY) {
    password = await readHidden("Mật khẩu mới: ");
    const confirmation = await readHidden("Nhập lại mật khẩu: ");
    if (confirmation !== password) fail("Hai lần nhập không khớp.");
  } else {
    // Piped input (e.g. a terminal without TTY support): first line is the password.
    process.stderr.write("Mật khẩu mới (một dòng): ");
    password = await readFirstLine();
  }

  if (password.length < MIN_LENGTH) fail(`Mật khẩu cần ít nhất ${MIN_LENGTH} ký tự.`);
  if (Buffer.byteLength(password, "utf8") > BCRYPT_MAX_BYTES) {
    fail(`Mật khẩu dài tối đa ${BCRYPT_MAX_BYTES} byte (giới hạn của bcrypt).`);
  }

  const hashed = await hash(password, BCRYPT_COST);
  console.log("\nDán dòng sau vào .env.local, rồi tăng SESSION_VERSION nếu muốn đăng xuất mọi máy:\n");
  console.log(`APP_PASSWORD_HASH_B64=${Buffer.from(hashed, "utf8").toString("base64")}`);
}

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();

    let value = "";
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Đã hủy."));
          return;
        }
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
        } else {
          value += char;
        }
      }
    };
    stdin.on("data", onData);
  });
}

function readFirstLine(): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin });
    let resolved = false;
    rl.once("line", (line) => {
      resolved = true;
      rl.close();
      resolve(line);
    });
    rl.once("close", () => {
      if (!resolved) resolve("");
    });
  });
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
