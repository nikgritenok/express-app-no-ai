import { z } from "zod";

const databaseUrlSchema = z.url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return ["postgres:", "postgresql:"].includes(url.protocol) && url.hostname !== "";
}, "Expected a PostgreSQL connection URL");

export const environmentSchema = z.object({
  PORT: z
    .string()
    // Require the absolute end of input; `$` also permits a trailing newline.
    .regex(/^[0-9]+(?![\s\S])/)
    .transform(Number)
    .pipe(z.number().int().min(0).max(65535))
    .default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DEBUG: z.string().default(""),
  DATABASE_URL: databaseUrlSchema,
});
