import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

import logger from "@connectors/logger/logger";
import { dbConfig } from "@connectors/resources/db/config";

async function runMigration() {
  const client = new Client({
    connectionString: dbConfig.getRequiredDatabaseURI(),
  });

  await client.connect();
  const db = drizzle(client);

  try {
    await migrate(db, { migrationsFolder: "sql-migrations" });
  } catch (err) {
    logger.error("Error applying SQL migration:", err);
  } finally {
    logger.info(">> Done running migrations.");
    await client.end();
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
