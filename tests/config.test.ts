import { describe, expect, it } from "vitest";

import { environmentSchema } from "../src/config.ts";

const DATABASE_URL = "postgresql://app:local@127.0.0.1:5432/app";

describe("environment configuration", () => {
  it.each([
    ["0", 0],
    ["65535", 65535],
    ["00080", 80],
  ])("converts decimal port %s to TCP port %i", (input, expected) => {
    expect(environmentSchema.parse({ PORT: input, DATABASE_URL }).PORT).toBe(expected);
  });

  it.each([
    ["negative", "-1"],
    ["overflow", "65536"],
    ["fraction", "1.5"],
    ["trailing garbage", "3000secret"],
    ["empty", ""],
    ["whitespace only", " "],
    ["leading whitespace", " 3000"],
    ["trailing newline", "3000\n"],
    ["explicit positive sign", "+3000"],
    ["hexadecimal", "0x80"],
    ["exponent", "1e3"],
    ["non-string", 3000],
  ])("rejects a %s port", (_description, PORT) => {
    const result = environmentSchema.safeParse({ PORT, DATABASE_URL });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([["PORT"]]);
    }
  });

  it.each(["", "staging", "Production"])("rejects unsupported NODE_ENV=%j", (NODE_ENV) => {
    const result = environmentSchema.safeParse({ NODE_ENV, DATABASE_URL });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([["NODE_ENV"]]);
    }
  });

  it("strips unrelated environment keys, including Compose-only settings and secrets", () => {
    const config = environmentSchema.parse({
      DATABASE_URL,
      PORT: "9000",
      NODE_ENV: "test",
      DEBUG: "express-app:server",
      HOST_PORT: "not-an-application-port",
      DATABASE_PASSWORD: "private-test-value",
    });

    expect(config).toEqual({
      DATABASE_URL,
      PORT: 9000,
      NODE_ENV: "test",
      DEBUG: "express-app:server",
    });
  });

  it.each([
    undefined,
    "",
    "not-a-url",
    "https://database.example/app",
    "file:///tmp/app",
    "postgresql:///app",
  ])("rejects an invalid or missing database URL (%j)", (url) => {
    const result = environmentSchema.safeParse({ DATABASE_URL: url });

    expect(result.success).toBe(false);
  });

  it.each(["postgres", "postgresql"])("accepts the %s database URL scheme", (scheme) => {
    const url = `${scheme}://app:local@127.0.0.1:5432/app`;
    expect(environmentSchema.parse({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });
});
