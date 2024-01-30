import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { dbConfig } from "@connectors/resources/db/config";

import * as schema from "./schema";

const pool = new Pool({
  connectionString: dbConfig.getRequiredDatabaseURI(),
});

export function getDbConnection() {
  const db = drizzle(pool, { schema });

  return db;
}
