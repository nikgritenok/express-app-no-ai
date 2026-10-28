import { describe, expect, it } from "vitest";
import { z } from "zod";

import { serve } from "./helpers/http.ts";

const problemSchema = z.strictObject({
  type: z.literal("about:blank"),
  title: z.string().min(1),
  status: z.number().int(),
  detail: z.string().min(1),
  instance: z.string(),
});

async function expectProblem(response: Response, status: number, instance: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toMatch(/^application\/problem\+json\b/);
  const body: unknown = await response.json();
  const problem = problemSchema.parse(body);
  expect(problem.status).toBe(status);
  expect(problem.instance).toBe(instance);
}

describe("Notes input boundaries", () => {
  it.for([
    ["missing content", {}],
    ["empty content", { content: "" }],
    ["whitespace content", { content: " \t\n " }],
    ["too long content", { content: "x".repeat(2001) }],
    ["unknown fields", { content: "note", extra: true }],
    ["numeric content", { content: 123 }],
    ["null content", { content: null }],
    ["array body", []],
    ["null body", null],
  ] as const)("rejects %s", async ([_name, body], t) => {
    const base = await serve(t);
    const response = await fetch(`${base}/api/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    await expectProblem(response, 400, "/api/notes");
  });

  it.for(["GET", "DELETE"])("rejects invalid UUID for %s", async (method, t) => {
    const base = await serve(t);
    await expectProblem(
      await fetch(`${base}/api/notes/not-a-uuid`, { method }),
      400,
      "/api/notes/not-a-uuid",
    );
  });

  it.for(["text/plain", "application/x-www-form-urlencoded"])(
    "rejects %s bodies",
    async (media, t) => {
      const base = await serve(t);
      const response = await fetch(`${base}/api/notes`, {
        method: "POST",
        headers: { "content-type": media },
        body: "content=note",
      });
      await expectProblem(response, 415, "/api/notes");
    },
  );

  it("rejects a missing media type", async (t) => {
    const base = await serve(t);
    await expectProblem(await fetch(`${base}/api/notes`, { method: "POST" }), 415, "/api/notes");
  });

  it.for([
    ["POST", "/api/notes"],
    ["GET", "/api/notes/8e5c7ee2-5f05-4f40-b6a2-c62bce1c5328"],
    ["DELETE", "/api/notes/8e5c7ee2-5f05-4f40-b6a2-c62bce1c5328"],
  ] as const)("rejects unexpected query on %s", async ([method, path], t) => {
    const base = await serve(t);
    const response = await fetch(`${base}${path}?unexpected=value`, {
      method,
      ...(method === "POST"
        ? {
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content: "note" }),
          }
        : {}),
    });
    await expectProblem(response, 400, path);
  });
});
