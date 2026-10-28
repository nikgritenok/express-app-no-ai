import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client.ts";

// One client per running application; importing this module opens no connections.
export function createDatabase(databaseUrl: string) {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter, log: [] });
}

export type Database = PrismaClient;
