import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { POD_DATABASE_NAME_REGEX } from "@app/lib/api/sandbox_functions/manifests";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const POD_DATABASES_SERVER_NAME = "pod_databases" as const;

const databaseParam = z
  .string()
  .regex(POD_DATABASE_NAME_REGEX)
  .describe(
    "The database name, as shown by the list_databases tool (lowercase letters, digits and " +
      "underscores, e.g. `chat`)."
  );

export const POD_DATABASES_TOOLS_METADATA = createToolsRecord({
  list_databases: {
    description:
      "List the pod's live databases with their size, which published sandbox functions " +
      "declare each one, and any untracked leftover databases no function declares anymore.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing pod databases...",
      done: "Listed pod databases",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  get_schema: {
    description:
      "Get a pod database's schema as a regenerated drizzle `{db}.db.ts` file (introspected " +
      "from the live database) together with the column modes declared by the published " +
      "functions' manifests. SQLite does not store modes, so re-add them from the modes " +
      "section when using the regenerated file as the shared schema source.",
    schema: { database: databaseParam },
    stake: "never_ask",
    displayLabels: {
      running: "Introspecting pod database...",
      done: "Introspected pod database",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  query: {
    description:
      "Execute a read-only SQL query against a pod database and get the rows back as JSON. " +
      "Writes are rejected (the database is opened read-only); results are capped at 1000 " +
      "rows with a truncated flag.",
    schema: {
      database: databaseParam,
      sql: z
        .string()
        .min(1)
        .describe(
          "The SQL to execute (a single SELECT-style statement; writes are rejected)."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Querying pod database...",
      done: "Queried pod database",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
});

export const POD_DATABASES_SERVER = {
  serverInfo: {
    name: POD_DATABASES_SERVER_NAME,
    version: "1.0.0",
    description:
      "Pod databases: inspect and query the shared SQLite databases that the pod's sandbox " +
      "functions declare and use.",
    icon: "CommandLineIcon",
    authorization: null,
    documentationUrl: null,
  },
  tools: Object.values(POD_DATABASES_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
    toolCostCategory: t.toolCostCategory,
    freeUsage: t.freeUsage,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(POD_DATABASES_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
