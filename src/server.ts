import debug from "debug";
import http from "node:http";

import { createApp } from "./app.ts";
import { environmentSchema } from "./config.ts";
import { createDatabase } from "./database.ts";

const result = environmentSchema.safeParse(process.env);
if (!result.success) {
  const fields = [...new Set(result.error.issues.map((issue) => issue.path[0]))];
  console.error(`Invalid environment fields: ${fields.join(", ")}`);
  process.exit(1);
}

const config = result.data;
const log = debug("express-app:server");
const db = createDatabase(config.DATABASE_URL);

try {
  // The pg adapter creates its pool lazily; $connect alone does not probe PostgreSQL.
  await db.$queryRaw`SELECT 1`;
} catch {
  console.error("Database connection failed. Check DATABASE_URL and PostgreSQL availability.");
  await db.$disconnect();
  process.exit(1);
}

const app = createApp(db);

app.set("port", config.PORT);
app.set("env", config.NODE_ENV);

const server = http.createServer(app);

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.syscall !== "listen") {
    throw error;
  }

  const bind = `Port ${config.PORT}`;

  switch (error.code) {
    case "EACCES":
      console.error(`${bind} requires elevated privileges`);
      process.exit(1);
    case "EADDRINUSE":
      console.error(`${bind} is already in use`);
      process.exit(1);
    default:
      throw error;
  }
});

server.on("listening", () => {
  const address = server.address();
  if (address === null) {
    return;
  }

  if (typeof address !== "string") {
    log(`Listening on port ${address.port}`);
  }
});

server.listen(config.PORT);

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(() => {
    void db.$disconnect().catch(() => {
      console.error("Database shutdown failed.");
      process.exitCode = 1;
    });
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
