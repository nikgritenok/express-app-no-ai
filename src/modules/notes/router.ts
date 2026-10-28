import { z } from "zod";

import type { Database } from "../../database.ts";
import { createApiModule, problemResponse, type ApiModule } from "../../http/openapi.ts";
import { ApiError } from "../../http/problem.ts";
import {
  createNoteSchema,
  noQuerySchema,
  noteParamsSchema,
  noteResponseSchema,
} from "./schemas.ts";

const noteSelect = { id: true, content: true, createdAt: true } as const;
const basePath = "/api/notes";

export function createNotesModule(db: Database): ApiModule {
  const module = createApiModule();

  module.router.use(basePath, (req, _res, next) => {
    if (!noQuerySchema.safeParse(req.query).success) {
      throw new ApiError(400, "Query parameters are not supported.");
    }
    next();
  });

  module.register(
    {
      method: "post",
      path: basePath,
      operationId: "createNote",
      summary: "Create a note",
      description:
        "No query parameters are accepted. Content is trimmed before validating the 1–2000 Unicode code point limit. JSON bodies are limited to 16 KiB.",
      request: {
        query: noQuerySchema,
        body: {
          required: true,
          content: {
            "application/json": {
              schema: createNoteSchema,
              example: { content: "Пример заметки" },
            },
          },
        },
      },
      responses: {
        201: {
          description: "Created",
          headers: z.object({
            Location: z.string().meta({
              description: "Relative path to the created note",
              example: `${basePath}/8e5c7ee2-5f05-4f40-b6a2-c62bce1c5328`,
            }),
          }),
          content: { "application/json": { schema: noteResponseSchema } },
        },
        400: problemResponse("Invalid JSON, body, UUID, or unexpected query parameters (400)"),
        413: problemResponse("Request body exceeds 16 KiB (413)"),
        415: problemResponse("Missing or unsupported media type, charset, or encoding (415)"),
        500: problemResponse("Generic internal server failure (500)"),
      },
    },
    async (req, res) => {
      if (!req.is("application/json")) {
        throw new ApiError(415, "Expected application/json.");
      }
      const body = createNoteSchema.safeParse(req.body);
      if (!body.success) {
        throw new ApiError(400, "Expected only content containing 1 to 2000 nonblank characters.");
      }
      const note = await db.note.create({ data: body.data, select: noteSelect });
      res.location(`${basePath}/${note.id}`).status(201).json(note);
    },
  );

  module.register(
    {
      method: "get",
      path: `${basePath}/{id}`,
      operationId: "getNote",
      summary: "Read a note",
      description:
        "No query parameters are accepted. Invalid UUIDs return 400 before database access.",
      request: { params: noteParamsSchema, query: noQuerySchema },
      responses: {
        200: {
          description: "Found",
          content: { "application/json": { schema: noteResponseSchema } },
        },
        400: problemResponse("Invalid JSON, body, UUID, or unexpected query parameters (400)"),
        404: problemResponse("Note does not exist (404)"),
        500: problemResponse("Generic internal server failure (500)"),
      },
    },
    async (req, res) => {
      const params = noteParamsSchema.safeParse(req.params);
      if (!params.success) throw new ApiError(400, "Expected a UUID note identifier.");
      const note = await db.note.findUnique({ where: { id: params.data.id }, select: noteSelect });
      if (!note) throw new ApiError(404, "Note not found.");
      res.json(note);
    },
  );

  module.register(
    {
      method: "delete",
      path: `${basePath}/{id}`,
      operationId: "deleteNote",
      summary: "Delete a note",
      description:
        "No query parameters are accepted. Invalid UUIDs return 400 before database access. Repeated deletion returns 404.",
      request: { params: noteParamsSchema, query: noQuerySchema },
      responses: {
        204: { description: "Deleted; empty response body" },
        400: problemResponse("Invalid JSON, body, UUID, or unexpected query parameters (400)"),
        404: problemResponse("Note does not exist (404)"),
        500: problemResponse("Generic internal server failure (500)"),
      },
    },
    async (req, res) => {
      const params = noteParamsSchema.safeParse(req.params);
      if (!params.success) throw new ApiError(400, "Expected a UUID note identifier.");
      const result = await db.note.deleteMany({ where: { id: params.data.id } });
      if (result.count === 0) throw new ApiError(404, "Note not found.");
      res.status(204).end();
    },
  );

  return module;
}
