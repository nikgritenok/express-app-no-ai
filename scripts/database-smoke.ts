import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { environmentSchema } from "../src/config.ts";
import { createDatabase } from "../src/database.ts";

const result = environmentSchema.pick({ DATABASE_URL: true }).safeParse(process.env);
if (!result.success) {
  console.error("Invalid environment fields: DATABASE_URL");
  process.exit(1);
}

const db = createDatabase(result.data.DATABASE_URL);
try {
  await db.$transaction(async (tx) => {
    const content = `Prisma smoke ${randomUUID()}`;
    const created = await tx.note.create({ data: { content } });
    const stored = await tx.note.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(stored.content, content);
    assert.equal(stored.createdAt.toISOString(), created.createdAt.toISOString());
    await tx.note.delete({ where: { id: created.id } });
    assert.equal(await tx.note.findUnique({ where: { id: created.id } }), null);
  });
  console.log("PostgreSQL smoke passed: create, read, delete; no smoke records retained.");
} catch {
  console.error("PostgreSQL smoke failed. Check database availability and applied migrations.");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
