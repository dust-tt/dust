import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  POD_DATABASE_NAME_REGEX,
  SANDBOX_FUNCTION_EXECUTION_MODES,
  SANDBOX_FUNCTION_SLUG_REGEX,
  SANDBOX_FUNCTION_SLUG_SEGMENT_REGEX,
  SANDBOX_FUNCTION_STAKES,
} from "@app/types/api/sandbox_functions";
import { z } from "zod";

export const SANDBOX_FUNCTIONS_SERVER_NAME = "sandbox_functions" as const;

export const SANDBOX_FUNCTIONS_TOOLS_METADATA = [
  {
    name: "list",
    description:
      "List the pod functions published in the current pod, with their " +
      "slug and description. Use the get tool to retrieve a function's input " +
      "and output schemas.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing pod functions...",
      done: "Listed pod functions",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "get",
    description:
      "Get a pod function's user identity policy and input and output JSON schemas by its slug.",
    schema: {
      slug: z
        .string()
        .min(1)
        .describe("The slug of the pod function, as shown by the list tool."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting pod function...",
      done: "Got pod function",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "publish",
    description:
      "Publish a pod function from a TypeScript source file in the current pod. The source " +
      "must default-export a `fetch(request: Request): Promise<Response>` handler and export a " +
      "`schema` with zod `input` and `output`. Set `schema.userIdentity` to `optional`, " +
      "`workspace_user_required`, `interactive_workspace_user_required`, or " +
      "`pod_member_required`; Frame v2 functions may also use `frame_author_required`. It is bundled on the " +
      "pod sandbox (only `zod` is available to import), and its contract is extracted from the " +
      "`schema` export. The published slug is prefixed with the app the source lives in, so " +
      "re-publishing the same name from the same app replaces the previous version while another " +
      "app's function of the same name is left alone.",
    schema: {
      slug: z
        .string()
        .regex(SANDBOX_FUNCTION_SLUG_SEGMENT_REGEX)
        .describe(
          "The function's name within its app: lowercase alphanumeric with single hyphen " +
            "separators (e.g. `send-slack-message`). Do not include the app prefix; publish " +
            "derives it from `path` and reports the full slug back."
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
            "tools. It lives in its app's `functions` folder (e.g. " +
            "`pod-<id>/MyApp/functions/greet.ts`). The app folder's name becomes the published " +
            "slug's prefix; a source at the pod root keeps its bare name."
        ),
      executionMode: z
        .enum(SANDBOX_FUNCTION_EXECUTION_MODES)
        .describe(
          "`fast` runs synchronously and returns in a fraction of the time, but cannot call Dust " +
            "tools through `dsbx tools`. It can still read and write pod state, run local " +
            "binaries and make outbound HTTP calls, though those count against its execution " +
            "ceiling. `durable` is for a function that calls `dsbx tools`, which may wait on the " +
            "user for approval or authentication. Keep the functions a Frame calls on user " +
            "interaction or on a poll `fast`, and isolate `dsbx tools` calls in their own " +
            "`durable` functions."
        ),
      defaultStake: z
        .enum(SANDBOX_FUNCTION_STAKES)
        .describe(
          "How much approval the function should require once it is shared as a tool, derived " +
            "from what it does rather than from how it is called: `never_ask` for a read that " +
            "changes nothing, `low` for anything that writes/deletes, and `high` only for something " +
            "extremely dangerous."
        ),
      domains: z
        .array(z.string())
        .optional()
        .describe(
          "Exact domains or wildcards (e.g. `api.stripe.com`, `*.stripe.com`) the function " +
            "makes outbound HTTPS requests to at runtime. Declare every domain the function " +
            "needs — each becomes a request a workspace admin reviews before the Pod can reach " +
            "it; it never grants access on its own. A domain the Pod (or workspace) already " +
            "allows is skipped."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Publishing pod function...",
      done: "Published pod function",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "unpublish",
    description:
      "Unpublish a pod function by its slug. Permanently delete the published bundle and all " +
      "invocation and tool-action history. The editable source file in the pod remains unchanged.",
    schema: {
      slug: z
        .string()
        .regex(SANDBOX_FUNCTION_SLUG_REGEX)
        .describe(
          "The slug of the pod function to unpublish, as shown by the list tool."
        ),
    },
    stake: "high",
    displayLabels: {
      running: "Unpublishing pod function...",
      done: "Unpublished pod function",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "call",
    description:
      "Call a pod function published in the current pod by its slug, passing its input " +
      "payload, and get back the function's output. Use the get tool first to see the function's " +
      "input schema. Input is validated inside the sandbox.",
    schema: {
      slug: z
        .string()
        .min(1)
        .describe(
          "The slug of the pod function to call, as shown by the list tool."
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
      running: "Calling pod function...",
      done: "Called pod function",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "inspect_invocations",
    description:
      "Inspect the most recent invocations of a pod function in the current pod, including " +
      "their inputs, results, and errors.",
    schema: {
      slug: z
        .string()
        .min(1)
        .describe("The slug of the pod function, as shown by the list tool."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .default(5)
        .describe("Maximum number of recent invocations to return."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Inspecting pod function invocations...",
      done: "Inspected pod function invocations",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "db_list",
    description: "List the pod's SQLite databases and their sizes.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing pod databases...",
      done: "Listed pod databases",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "db_schema",
    description: "Get a pod database's live schema as a drizzle schema file.",
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
  {
    name: "db_query",
    description:
      "Run a single SQL statement against a pod database: SELECT and DML.",
    schema: {
      database: z
        .string()
        .regex(POD_DATABASE_NAME_REGEX)
        .describe("The database name, as shown by the db_list tool."),
      sql: z
        .string()
        .min(1)
        .describe(
          "A SINGLE SQL statement (SELECT or INSERT/UPDATE/DELETE); multiple statements " +
            "are rejected, issue one call per statement."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Querying pod database...",
      done: "Queried pod database",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "db_reconcile",
    description:
      "Apply a pod database's drizzle schema file to its live database (additive changes only).",
    schema: {
      database: z
        .string()
        .regex(POD_DATABASE_NAME_REGEX)
        .describe(
          "The database's short name as declared by the schema file (e.g. `chat`), without " +
            "the app prefix."
        ),
      path: z
        .string()
        .min(1)
        .describe(
          "Scoped path to the database's drizzle schema file in the pod, as shown by the " +
            "files tools (e.g. `pod-<id>/MyApp/databases/chat.db.ts`)."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Reconciling pod database...",
      done: "Reconciled pod database",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const;

export const SANDBOX_FUNCTIONS_SERVER = {
  serverInfo: {
    name: SANDBOX_FUNCTIONS_SERVER_NAME,
    version: "1.0.0",
    description:
      "Pod functions: schema-typed callables bundled and run on the pod's " +
      "sandbox.",
    icon: "TerminalSquareIcon",
    authorization: null,
    documentationUrl: null,
  },
  tools: SANDBOX_FUNCTIONS_TOOLS_METADATA,
} as const satisfies ServerMetadata;
