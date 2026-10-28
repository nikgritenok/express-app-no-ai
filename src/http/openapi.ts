import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  type ResponseConfig,
  type RouteConfig,
} from "@asteasolutions/zod-to-openapi";
import { Router } from "express";
import type { RequestHandler } from "express";

import { problemSchema } from "./problem.ts";

type ApiOperation = Omit<RouteConfig, "method"> & {
  method: "get" | "post" | "put" | "patch" | "delete" | "head" | "options" | "trace";
};

export interface ApiModule {
  router: Router;
  registry: OpenAPIRegistry;
  register(operation: ApiOperation, handler: RequestHandler): void;
}

// The method and path are declared once, for both Express and OpenAPI.
export function createApiModule(): ApiModule {
  const router = Router();
  const registry = new OpenAPIRegistry();
  return {
    router,
    registry,
    register(operation, handler) {
      registry.registerPath(operation);
      const expressPath = operation.path.replace(/\{([^}]+)\}/g, ":$1");
      router[operation.method](expressPath, handler);
    },
  };
}

export function generateOpenApi(modules: readonly ApiModule[]) {
  const generator = new OpenApiGeneratorV31(
    modules.flatMap((module) => module.registry.definitions),
  );
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "express-app API",
      version: "1.0.0",
      description: "Unauthenticated hackathon API. Do not store sensitive data.",
    },
    servers: [{ url: "/" }],
    security: [],
  });
}

export function problemResponse(description: string): ResponseConfig {
  return {
    description,
    content: { "application/problem+json": { schema: problemSchema } },
  };
}
