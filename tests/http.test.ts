import { describe, expect, it } from "vitest";
import { z } from "zod";

import { send, serve } from "./helpers/http.ts";

const problemSchema = z.object({
  type: z.literal("about:blank"),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string(),
});

const unsupportedEncodings: Record<string, string>[] = [
  { "content-type": "application/json; charset=iso-8859-1" },
  { "content-type": "application/json", "content-encoding": "unsupported" },
];
describe("shared JSON API boundary", () => {
  it("returns API 404 without reflecting query values", async (t) => {
    const base = await serve(t);
    const response = await send(`${base}/api/missing?token=private-test-marker`);

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/^application\/problem\+json\b/);
    const body: unknown = JSON.parse(response.body);
    const problem = problemSchema.parse(body);
    expect(problem.status).toBe(404);
    expect(problem.instance).toBe("/api/missing");
    expect(response.body).not.toContain("private-test-marker");
  });

  it("keeps malformed JSON out of the HTML error handler and does not reflect the body", async (t) => {
    const base = await serve(t);
    const response = await send(`${base}/api/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"content":"private-test-marker",',
    });

    expect(response.status).toBe(400);
    expect(response.headers["content-type"]).toMatch(/^application\/problem\+json\b/);
    const body: unknown = JSON.parse(response.body);
    expect(problemSchema.parse(body).status).toBe(400);
    expect(response.body).not.toContain("private-test-marker");
    expect(response.body).not.toContain("SyntaxError");
  });

  it("rejects oversized bodies before module validation", async (t) => {
    const base = await serve(t);
    const response = await send(`${base}/api/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "x".repeat(16 * 1024) }),
    });

    expect(response.status).toBe(413);
    expect(response.headers["content-type"]).toMatch(/^application\/problem\+json\b/);
    const body: unknown = JSON.parse(response.body);
    expect(problemSchema.parse(body).status).toBe(413);
  });
  it.for(unsupportedEncodings)("rejects unsupported body encoding (%j)", async (headers, t) => {
    const base = await serve(t);
    const response = await send(`${base}/api/notes`, {
      method: "POST",
      headers,
      body: JSON.stringify({ content: "note" }),
    });

    expect(response.status).toBe(415);
    expect(response.headers["content-type"]).toMatch(/^application\/problem\+json\b/);
    const body: unknown = JSON.parse(response.body);
    expect(problemSchema.parse(body).status).toBe(415);
  });

  it("rejects invalid URL encoding as an API error", async (t) => {
    const base = await serve(t);
    const response = await send(`${base}/api/notes/%ZZ`);

    expect(response.status).toBe(400);
    expect(response.headers["content-type"]).toMatch(/^application\/problem\+json\b/);
    const body: unknown = JSON.parse(response.body);
    expect(problemSchema.parse(body).status).toBe(400);
  });
});
