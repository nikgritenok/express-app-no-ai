import { z } from "zod";

// The generator reads a pipe's input schema: raw input has no length cap,
// because the 1–2000 Unicode code point limit applies only after trimming.
const noteContentInputSchema = z
  .string()
  .regex(/\S/)
  .pipe(z.string().trim().min(1).max(2000))
  .meta({
    description:
      "Trimmed before validation; the result must contain 1–2000 Unicode code points. Raw input may include surrounding whitespace.",
    example: "Пример заметки",
  });

export const createNoteSchema = z
  .strictObject({
    content: noteContentInputSchema,
  })
  .meta({
    id: "CreateNote",
    description: "A note to create; unknown fields are rejected.",
    example: { content: "Пример заметки" },
  });

export const noteParamsSchema = z
  .strictObject({
    id: z.uuid().meta({ description: "UUID note identifier" }),
  })
  .meta({ id: "NoteParams", description: "The note identifier in the request path." });
export const noQuerySchema = z.strictObject({}).meta({
  id: "NoQuery",
  description: "No query parameters are accepted.",
});

export const noteResponseSchema = z
  .strictObject({
    id: z.uuid().meta({
      description: "UUID note identifier",
      example: "8e5c7ee2-5f05-4f40-b6a2-c62bce1c5328",
    }),
    content: z.string().min(1).max(2000).meta({
      description: "Trimmed content containing 1–2000 Unicode code points.",
      example: "Пример заметки",
    }),
    createdAt: z.iso.datetime().meta({
      description: "Creation time as an ISO 8601 UTC timestamp",
      example: "2026-01-01T12:00:00.000Z",
    }),
  })
  .meta({ id: "Note", description: "A stored note." });
