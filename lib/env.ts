import { z } from "zod";

// Env is read at call time (not module load) so `next build` works without secrets
// and the running server always sees the values it was started with.

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const authEnvSchema = z.object({
  APP_USERNAME: z.string().min(1),
  APP_PASSWORD_HASH_B64: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  SESSION_VERSION: z.string().min(1),
});

const languageToolEnvSchema = z.object({
  LT_URL: z.preprocess(emptyToUndefined, z.url().default("http://localhost:8081")),
});

const databaseEnvSchema = z.object({
  DATABASE_PATH: z.preprocess(emptyToUndefined, z.string().default("./data/app.db")),
});

export type AuthEnv = z.infer<typeof authEnvSchema>;

export function getAuthEnv(): AuthEnv {
  return parseEnv(authEnvSchema, "auth");
}

export function getLanguageToolUrl(): string {
  return parseEnv(languageToolEnvSchema, "LanguageTool").LT_URL.replace(/\/+$/, "");
}

export function getDatabasePath(): string {
  return parseEnv(databaseEnvSchema, "database").DATABASE_PATH;
}

function parseEnv<T extends z.ZodType>(schema: T, label: string): z.infer<T> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    // Only report key names, never values.
    const keys = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid ${label} environment variables: ${keys}`);
  }
  return result.data;
}
