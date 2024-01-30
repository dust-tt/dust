import { eq, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { dbConfig } from "@connectors/db/config";
import { connectors } from "@connectors/db/schema/connectors";

import * as schema from "./schema";

const pool = new Pool({
  connectionString: dbConfig.getRequiredDatabaseURI(),
});

const db = drizzle(pool, { schema });

// Retrieve the full object.
const result = await db.select().from(connectors);

// Retrieve only the selected field.
const partialResult = await db
  .select({ createdAt: connectors.createdAt })
  .from(connectors)
  .where(
    or(eq(connectors.id, 42), eq(connectors.dataSourceName, "managed-notion"))
  );

// Fetch ConfluenceConfiguration with the connector.
const confluenceConfigurationWithConnector =
  await db.query.confluenceConfigurations.findMany({
    with: {
      connectors: true,
    },
  });
