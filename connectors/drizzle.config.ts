import type { Config } from "drizzle-kit";

const { CONNECTORS_DATABASE_URI } = process.env;
if (!CONNECTORS_DATABASE_URI) {
  throw new Error("CONNECTORS_DATABASE_URI is not defined");
}

export default {
  out: "./sql-migrations",
  schema: "./src/db/schema/*.ts",
  driver: "pg",
  dbCredentials: {
    connectionString: CONNECTORS_DATABASE_URI,
  },
  verbose: true,
  strict: true,
} satisfies Config;
