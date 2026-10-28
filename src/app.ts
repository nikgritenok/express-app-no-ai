import { apiReference } from "@scalar/express-api-reference";
import cookieParser from "cookie-parser";
import express, { type ErrorRequestHandler } from "express";
import createError, { type HttpError } from "http-errors";
import logger from "morgan";
import path from "node:path";

import type { Database } from "./database.ts";
import { generateOpenApi } from "./http/openapi.ts";
import { ApiError, apiErrorHandler } from "./http/problem.ts";
import { createNotesModule } from "./modules/notes/router.ts";
import indexRouter from "./routes/index.ts";
import usersRouter from "./routes/users.ts";

export function createApp(db: Database) {
  const app = express();
  const apiModules = [createNotesModule(db)];
  const openApiDocument = JSON.stringify(generateOpenApi(apiModules));

  app.set("views", path.join(import.meta.dirname, "../views"));
  app.set("view engine", "pug");

  app.use(logger("dev"));

  app.get("/openapi.json", (_req, res) => {
    res.type("application/json").send(openApiDocument);
  });
  app.get(
    "/docs",
    apiReference({
      url: "/openapi.json",
      pageTitle: "express-app API",
      cdn: "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.76.0",
      telemetry: false,
      withDefaultFonts: false,
      agent: { disabled: true },
      mcp: { disabled: true },
      hideClientButton: true,
      showDeveloperTools: "never",
    }),
  );

  app.use("/api", express.json({ limit: "16kb" }));
  for (const apiModule of apiModules) {
    app.use(apiModule.router);
  }
  app.use("/api", () => {
    throw new ApiError(404, "API resource not found.");
  });
  app.use("/api", apiErrorHandler);

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(express.static(path.join(import.meta.dirname, "../public")));

  app.use("/", indexRouter);
  app.use("/users", usersRouter);

  app.use((_req, _res, next) => {
    next(createError(404));
  });

  const errorHandler: ErrorRequestHandler = (err: HttpError, req, res, _next) => {
    res.locals.message = err.message;
    res.locals.error = req.app.get("env") === "development" ? err : {};

    res.status(err.status || 500);
    res.render("error");
  };

  app.use(errorHandler);
  return app;
}
