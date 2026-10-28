import { defineConfig } from "prisma/config";

import { environmentSchema } from "./src/config.ts";

// Generation and validation do not need a live database or a connection URL.
const result = environmentSchema.pick({ DATABASE_URL: true }).partial().safeParse(process.env);
if (!result.success) {
  throw new Error("Invalid environment fields: DATABASE_URL");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(result.data.DATABASE_URL === undefined
    ? {}
    : { datasource: { url: result.data.DATABASE_URL } }),
});
