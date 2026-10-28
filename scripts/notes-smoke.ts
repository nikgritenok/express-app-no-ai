import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { z } from "zod";

import { createApp } from "../src/app.ts";
import { environmentSchema } from "../src/config.ts";
import { createDatabase } from "../src/database.ts";
import { noteResponseSchema } from "../src/modules/notes/schemas.ts";

const environment = environmentSchema.pick({ DATABASE_URL: true }).safeParse(process.env);
if (!environment.success) {
  console.error("Invalid environment fields: DATABASE_URL");
  process.exit(1);
}

const problemSchema = z.object({
  type: z.literal("about:blank"),
  title: z.string().min(1),
  status: z.number().int(),
  detail: z.string().min(1),
  instance: z.string(),
});

async function expectProblem(response: Response, status: number, path: string) {
  assert.equal(response.status, status);
  assert.match(response.headers.get("content-type") ?? "", /^application\/problem\+json\b/);
  const data: unknown = await response.json();
  const problem = problemSchema.parse(data);
  assert.equal(problem.status, status);
  assert.equal(problem.instance, path);
}

const db = createDatabase(environment.data.DATABASE_URL);
const server = createServer(createApp(db));
// A unique content marker also allows cleanup if a create succeeds but its HTTP response fails.
const content = `Notes HTTP smoke ${randomUUID()}`.padEnd(2000, "x");
let failed = false;
try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Missing loopback address");
  const base = `http://127.0.0.1:${address.port}`;

  const createdResponse = await fetch(`${base}/api/notes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: `  ${content}  ` }),
  });
  assert.equal(createdResponse.status, 201);
  const createdBody: unknown = await createdResponse.json();
  const created = noteResponseSchema.parse(createdBody);
  assert.equal(created.content, content);
  const location = `/api/notes/${created.id}`;
  assert.equal(createdResponse.headers.get("location"), location);

  const readResponse = await fetch(`${base}${location}`);
  assert.equal(readResponse.status, 200);
  const readBody: unknown = await readResponse.json();
  assert.deepEqual(noteResponseSchema.parse(readBody), created);

  const deleteResponse = await fetch(`${base}${location}`, { method: "DELETE" });
  assert.equal(deleteResponse.status, 204);
  assert.equal(await deleteResponse.text(), "");
  await expectProblem(await fetch(`${base}${location}`), 404, location);
  await expectProblem(await fetch(`${base}${location}`, { method: "DELETE" }), 404, location);
  await expectProblem(
    await fetch(`${base}/api/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "   " }),
    }),
    400,
    "/api/notes",
  );
} catch {
  failed = true;
} finally {
  try {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    }
  } catch {
    failed = true;
  }
  try {
    await db.note.deleteMany({ where: { content } });
  } catch {
    failed = true;
  } finally {
    try {
      await db.$disconnect();
    } catch {
      failed = true;
    }
  }
}

if (failed) {
  console.error(
    "Notes HTTP smoke failed. Check database availability, migrations, and the API contract; cleanup was attempted.",
  );
  process.exitCode = 1;
} else {
  console.log(
    "Notes HTTP smoke passed: create, read, delete, not-found, invalid input; no smoke records retained.",
  );
}
