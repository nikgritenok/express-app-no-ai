import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import type { IncomingHttpHeaders } from "node:http";
import type { TestContext } from "vitest";

import { createApp } from "../../src/app.ts";
import { createDatabase } from "../../src/database.ts";

export type HttpResponse = {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
};

// These tests exercise paths that must reject requests before any SQL is executed.
// Constructing a real Prisma Client is lazy; neither .env nor a live DB is needed.
export async function serve(t: TestContext, environment = "production"): Promise<string> {
  const db = createDatabase("postgresql://unused:unused@127.0.0.1:1/unused");
  const app = createApp(db);
  app.set("env", environment);
  const server = app.listen(0, "127.0.0.1");

  t.onTestFinished(async () => {
    try {
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
      server.closeAllConnections();
      await promise;
    } finally {
      await db.$disconnect();
    }
  });

  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

export function send(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<HttpResponse> {
  const { promise, resolve, reject } = Promise.withResolvers<HttpResponse>();
  const req = request(
    url,
    { method: options.method ?? "GET", headers: options.headers, agent: false },
    (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    },
  );
  req.on("error", reject);
  req.end(options.body);
  return promise;
}
