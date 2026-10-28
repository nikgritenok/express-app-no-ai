import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { serve, send, type HttpResponse } from "./helpers/http.ts";

function assertHtmlError(response: HttpResponse, status: number): void {
  assert.equal(response.status, status);
  assert.match(response.headers["content-type"] ?? "", /^text\/html\b/);
  assert.match(response.body, /<!DOCTYPE html>/i);
  assert.match(response.body, /<h1>[^<]+<\/h1>/);
}

function assertNoStack(body: string): void {
  // Recognize JavaScript stack frames, including HTML-escaped newlines, rather
  // than rejecting ordinary prose that happens to contain the word "at".
  assert.doesNotMatch(body, /(?:\n|&#(?:10|x0*a);)\s*at\s+[^\n<]+/i);
  assert.doesNotMatch(body, /<pre[^>]*>\s*(?:[A-Za-z]*Error|SyntaxError):/i);
}

describe("public HTTP API", { concurrent: false }, () => {
  it("renders the home page with its stylesheet", async (t) => {
    const base = await serve(t);
    const response = await send(`${base}/`);

    assert.equal(response.status, 200);
    assert.match(response.headers["content-type"] ?? "", /^text\/html\b/);
    assert.match(response.body, /<!DOCTYPE html>/i);
    assert.match(response.body, /<link\b[^>]*href="\/stylesheets\/style\.css"/);
  });

  it("serves HEAD with GET metadata but no response body", async (t) => {
    const base = await serve(t);
    for (const path of ["/", "/users", "/stylesheets/style.css"]) {
      const get = await send(`${base}${path}`);
      const head = await send(`${base}${path}`, { method: "HEAD" });

      assert.equal(get.status, 200, path);
      assert.equal(head.status, get.status, path);
      assert.equal(head.headers["content-type"], get.headers["content-type"], path);
      assert.equal(head.headers["content-length"], get.headers["content-length"], path);
      assert.equal(head.headers.etag, get.headers.etag, path);
      assert.equal(head.body, "", path);
    }
  });

  it("serves CSS and honors conditional requests for an unchanged asset", async (t) => {
    const base = await serve(t);
    const css = await send(`${base}/stylesheets/style.css`);

    assert.equal(css.status, 200);
    assert.match(css.headers["content-type"] ?? "", /^text\/css\b/);
    assert.equal(Number(css.headers["content-length"]), Buffer.byteLength(css.body));
    assert.equal(typeof css.headers.etag, "string");
    const etag = css.headers.etag;
    assert.ok(etag);

    const unchanged = await send(`${base}/stylesheets/style.css`, {
      headers: { "If-None-Match": etag },
    });
    assert.equal(unchanged.status, 304);
    assert.equal(unchanged.headers.etag, etag);
    assert.equal(unchanged.body, "");
  });

  it("renders an HTML 404 without exposing a production stack", async (t) => {
    const base = await serve(t);
    const response = await send(`${base}/missing-resource`);

    assertHtmlError(response, 404);
    assertNoStack(response.body);
  });

  it("rejects malformed JSON with an HTML 400 without exposing a production stack", async (t) => {
    const base = await serve(t);
    const response = await send(`${base}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"broken":',
    });

    assertHtmlError(response, 400);
    assertNoStack(response.body);
  });

  it("includes diagnostic stack frames in development errors", async (t) => {
    const base = await serve(t, "development");
    const response = await send(`${base}/missing-resource`);

    assertHtmlError(response, 404);
    assert.match(response.body, /<pre[^>]*>[\s\S]*\n\s*at\s+[^\n<]+/);
  });
});
