import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { dbConfig } from "@connectors/db/config";
import { connectors } from "@connectors/db/schema/connectors";

const pool = new Pool({
  connectionString: dbConfig.getRequiredDatabaseURI(),
});

const db = drizzle(pool);

// Retrieve the full object.
const result = await db.select().from(connectors);

// Retrieve only the selected field.
const partialResult = await db
  .select({ createdAt: connectors.createdAt })
  .from(connectors);
