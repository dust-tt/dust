import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  POD_DATABASE_NAME_REGEX,
  SANDBOX_FUNCTION_SLUG_REGEX,
} from "@app/types/api/sandbox_functions";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const SANDBOX_FUNCTIONS_SERVER_NAME = "sandbox_functions" as const;

export const SANDBOX_FUNCTIONS_TOOLS_METADATA = createToolsRecord({
  list: {
    description:
      "List the sandbox functions published in the current pod, with their " +
      "slug and description. Use the get tool to retrieve a function's input " +
      "and output schemas.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing sandbox functions...",
      done: "Listed sandbox functions",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  get: {
    description:
      "Get a sandbox function's input and output JSON schemas by its slug.",
    schema: {
      slug: z
        .string()
        .min(1)
        .describe(
          "The slug of the sandbox function, as shown by the list tool."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting sandbox function...",
      done: "Got sandbox function",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  publish: {
    description:
      "Publish a sandbox function from a TypeScript source file in the current pod. The source " +
      "must default-export a `fetch(request: Request): Promise<Response>` handler and export a " +
      "`schema` with zod `input` and `output`. It is bundled on the pod sandbox (only `zod` is " +
      "available to import) and its input and output JSON schemas are extracted from the `schema` " +
      "export. Re-publishing the same slug replaces the previous version.",
    schema: {
      slug: z
        .string()
        .regex(SANDBOX_FUNCTION_SLUG_REGEX)
        .describe(
          "Unique function identifier within the pod: lowercase alphanumeric with single hyphen " +
            "separators (e.g. `send-slack-message`)."
        ),
      description: z
        .string()
        .min(1)
        .describe(
          "Short description of what the function does, shown by the list tool."
        ),
      path: z
        .string()
        .min(1)
        .describe(
          "Scoped path to the function's TypeScript source in the pod, as shown by the files " +
            "tools (e.g. `pod-<id>/greet.ts`)."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Publishing sandbox function...",
      done: "Published sandbox function",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  call: {
    description:
      "Call a sandbox function published in the current pod by its slug, passing its input " +
      "payload, and get back the function's output. Use the get tool first to see the function's " +
      "input schema. Input is validated inside the sandbox.",
    schema: {
      slug: z
        .string()
        .min(1)
        .describe(
          "The slug of the sandbox function to call, as shown by the list tool."
        ),
      input: z
        .record(z.unknown())
        .optional()
        .describe(
          "The function's input payload as a JSON object, matching its input schema (see the get tool)."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Calling sandbox function...",
      done: "Called sandbox function",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  db_list: {
    description:
      "List the pod's live SQLite databases with their sizes. A database is created by the " +
      "first publish of a function that declares it.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing pod databases...",
      done: "Listed pod databases",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  db_schema: {
    description:
      "Get the live schema of a pod database, regenerated from the SQLite file as a drizzle " +
      "schema file. Column modes are not stored in SQLite and do not appear: the authored " +
      "databases/{db}.db.ts file stays the source of truth.",
    schema: {
      database: z
        .string()
        .regex(POD_DATABASE_NAME_REGEX)
        .describe("The database name, as shown by the db_list tool."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Reading database schema...",
      done: "Read database schema",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  db_query: {
    description:
      "Run a single SQL statement against a pod database: SELECT and DML " +
      "(INSERT/UPDATE/DELETE/REPLACE, optionally WITH-prefixed, RETURNING supported) are " +
      "allowed; schema changes (DDL) are rejected — evolve the schema with the db_reconcile " +
      "tool or by publishing. Rows come back as JSON; a result crossing the inline bounds is " +
      "written in full to a sandbox file the response names.",
    schema: {
      database: z
        .string()
        .regex(POD_DATABASE_NAME_REGEX)
        .describe("The database name, as shown by the db_list tool."),
      sql: z
        .string()
        .min(1)
        .describe(
          "One SQL statement (SELECT or INSERT/UPDATE/DELETE). Multiple statements are " +
            "rejected."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Querying pod database...",
      done: "Queried pod database",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  db_reconcile: {
    description:
      "Apply a pod database's drizzle schema file to its live SQLite file with additive DDL " +
      "only, creating the database on first claim. Destructive changes are rejected with the " +
      "additive migration path. Use it after editing a databases/{db}.db.ts schema file; " +
      "publishing a function that declares the database runs the same reconcile.",
    schema: {
      database: z
        .string()
        .regex(POD_DATABASE_NAME_REGEX)
        .describe("The database name declared by the schema file."),
      path: z
        .string()
        .min(1)
        .describe(
          "Scoped path to the database's drizzle schema file in the pod, as shown by the " +
            "files tools (e.g. `pod-<id>/databases/chat.db.ts`)."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Reconciling pod database...",
      done: "Reconciled pod database",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
});

export const SANDBOX_FUNCTIONS_SERVER = {
  serverInfo: {
    name: SANDBOX_FUNCTIONS_SERVER_NAME,
    version: "1.0.0",
    description:
      "Sandbox functions: schema-typed callables bundled and run on the pod's " +
      "sandbox.",
    icon: "CommandLineIcon",
    authorization: null,
    documentationUrl: null,
  },
  tools: Object.values(SANDBOX_FUNCTIONS_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
    toolCostCategory: t.toolCostCategory,
    freeUsage: t.freeUsage,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(SANDBOX_FUNCTIONS_TOOLS_METADATA).map((t) => [
      t.name,
      t.stake,
    ])
  ),
} as const satisfies ServerMetadata;
