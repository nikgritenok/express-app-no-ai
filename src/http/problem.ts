import type { ErrorRequestHandler } from "express";
import createError from "http-errors";
import { STATUS_CODES } from "node:http";
import { z } from "zod";

export const problemSchema = z
  .strictObject({
    type: z.literal("about:blank"),
    title: z.string(),
    status: z.number().int(),
    detail: z.string(),
    instance: z.string(),
  })
  .meta({ id: "Problem", description: "RFC 9457 error without stack traces or database details." });

export class ApiError extends Error {
  readonly status: 400 | 404 | 409 | 415;

  constructor(status: 400 | 404 | 409 | 415, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
  }
}

export const apiErrorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  let status = 500;
  let detail = "An unexpected server error occurred.";

  if (error instanceof ApiError) {
    status = error.status;
    detail = error.message;
  } else if (error instanceof URIError) {
    status = 400;
    detail = "Invalid URL encoding.";
  } else if (createError.isHttpError(error)) {
    switch (error.status) {
      case 400:
        status = 400;
        detail = "Invalid JSON request body.";
        break;
      case 413:
        status = 413;
        detail = "Request body exceeds the 16 KiB limit.";
        break;
      case 415:
        status = 415;
        detail = "Unsupported request body encoding.";
        break;
    }
  }

  res
    .status(status)
    .type("application/problem+json")
    .json({
      type: "about:blank",
      title: STATUS_CODES[status],
      status,
      detail,
      instance: req.originalUrl.split("?")[0],
    });
};
