import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createNoteSchema } from "../src/modules/notes/schemas.ts";
import { serve } from "./helpers/http.ts";

const documentSchema = z.object({
  openapi: z.literal("3.1.0"),
  paths: z.record(z.string(), z.unknown()),
  components: z.object({ schemas: z.record(z.string(), z.unknown()) }),
});

function resolveSchema(value: unknown, schemas: Record<string, unknown>) {
  const reference = z.object({ $ref: z.string() }).safeParse(value);
  if (!reference.success) return value;
  const prefix = "#/components/schemas/";
  expect(reference.data.$ref.startsWith(prefix)).toBe(true);
  const name = reference.data.$ref.slice(prefix.length);
  expect(Object.hasOwn(schemas, name)).toBe(true);
  return schemas[name];
}

describe("generated OpenAPI", () => {
  it("publishes a strict request schema and an example accepted by the API validator", async (t) => {
    const base = await serve(t);
    const response = await fetch(`${base}/openapi.json`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json\b/);
    const raw: unknown = await response.json();
    const document = documentSchema.parse(raw);
    const path = z
      .object({
        post: z.object({
          requestBody: z.object({
            required: z.literal(true),
            content: z.object({
              "application/json": z.object({ schema: z.unknown(), example: z.unknown() }),
            }),
          }),
          responses: z.record(z.string(), z.unknown()),
        }),
      })
      .parse(document.paths["/api/notes"]);
    const media = path.post.requestBody.content["application/json"];
    const requestSchema = resolveSchema(media.schema, document.components.schemas);
    expect(requestSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["content"],
      properties: { content: { type: "string" } },
    });
    const requestProperties = z
      .object({ properties: z.object({ content: z.record(z.string(), z.unknown()) }) })
      .parse(requestSchema).properties;
    // Limits apply after trimming: a raw maxLength would reject valid padded content.
    expect(Object.hasOwn(requestProperties.content, "maxLength")).toBe(false);
    expect(createNoteSchema.safeParse(media.example).success).toBe(true);
    expect(path.post.responses).toMatchObject({
      "201": { headers: { Location: { required: true } } },
      "400": { content: { "application/problem+json": {} } },
      "413": { content: { "application/problem+json": {} } },
      "415": { content: { "application/problem+json": {} } },
      "500": { content: { "application/problem+json": {} } },
    });
  });

  it("describes UUID path validation and deletion without a response body", async (t) => {
    const base = await serve(t);
    const response = await fetch(`${base}/openapi.json`);
    const raw: unknown = await response.json();
    const document = documentSchema.parse(raw);
    const path = z
      .object({
        get: z.object({
          parameters: z.array(z.unknown()),
          responses: z.record(z.string(), z.unknown()),
        }),
        delete: z.object({
          parameters: z.array(z.unknown()),
          responses: z.record(z.string(), z.unknown()),
        }),
      })
      .parse(document.paths["/api/notes/{id}"]);
    for (const operation of [path.get, path.delete]) {
      expect(operation.parameters).toContainEqual(
        expect.objectContaining({
          in: "path",
          name: "id",
          required: true,
          schema: expect.objectContaining({ type: "string", format: "uuid" }),
        }),
      );
      expect(operation.responses).toMatchObject({
        "404": { content: { "application/problem+json": {} } },
      });
    }
    expect(path.get.responses).toMatchObject({ "200": { content: { "application/json": {} } } });
    const deleted = z.record(z.string(), z.unknown()).parse(path.delete.responses["204"]);
    expect(Object.hasOwn(deleted, "content")).toBe(false);
  });
});
