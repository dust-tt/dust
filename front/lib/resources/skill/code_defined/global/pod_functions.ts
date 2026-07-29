import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  SANDBOX_FUNCTIONS_SERVER_NAME,
  type SANDBOX_FUNCTIONS_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/sandbox_functions/metadata";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import { isPodConversation } from "@app/types/assistant/conversation";

function toolName(
  name: (typeof SANDBOX_FUNCTIONS_TOOLS_METADATA)[number]["name"]
): string {
  return getPrefixedToolName(SANDBOX_FUNCTIONS_SERVER_NAME, name);
}

export const podFunctionsSkill = {
  sId: "pod_functions",
  kind: "global",
  name: "Pod Functions",
  userFacingDescription:
    "Run hosted functions on the Pod's Computer that can persist data and call other tools.",
  agentFacingDescription:
    "A pod function is a hosted function that runs on the Pod's own Computer, shared across " +
    "every conversation in the Pod, with the ability to persist data and call other tools. It's " +
    "callable by slug from this conversation or from a Frame's own runtime.",
  instructions: `Pod functions are versioned, typed functions published on the Pod's own
Computer: a persistent environment shared across every conversation in the Pod, not the one
scoped to this conversation. Each one is a TypeScript module with zod-typed input and output,
bundled at publish time and reusable across conversations in the same Pod, callable from a
Frame's own runtime or directly from this conversation with the call tool described below.

Reach for a pod function instead of inline code or an ad hoc tool call when any of these apply:

- A Frame needs a server-side capability it cannot run inside its own browser sandbox: calling
  another tool through dsbx, using a workspace secret, or logic no client-side code should hold
  (see "Calling other tools from a function" below).
- Data needs to persist beyond one call: files on the Pod, or rows in a SQLite database, are
  there on the next call and visible to a Frame that always reflects the latest state (see
  "Persisting state across calls" below).

#### Authoring a function

Write the source as a TypeScript file on the Pod file system (the Computer's mount at
\`/files/pod-<podId>\`, or through the \`files\` MCP server under a \`pod-<podId>/<rel>\` path). The module
must:

- export a \`schema\` object with a \`description\` and zod \`input\` and \`output\` schemas,
- default-export an object with a \`fetch(request: Request): Promise<Response>\` method (the Bun and
  Web Workers handler shape). A bare default-exported function is rejected.

At invocation the request body is validated against \`schema.input\` before \`fetch\` runs, so read the
typed input with \`await request.json()\` and return the result with \`Response.json(...)\`. A minimal
function:

\`\`\`ts
import { z } from "zod";

export const schema = {
  description: "Greet a person by name.",
  input: z.object({ name: z.string() }),
  output: z.object({ greeting: z.string() }),
};

export default {
  async fetch(request: Request): Promise<Response> {
    const { name } = await request.json();
    return Response.json({ greeting: \`Hello, \${name}!\` });
  },
};
\`\`\`

You can split the implementation across several files on the Pod and import them with relative paths
(e.g. \`import { parse } from "./lib/parse.ts"\`). Publishing bundles the entrypoint and all of its
relative imports into one module. The bundle is a snapshot taken at publish time, so editing an
imported helper has no effect until you re-publish.

The external packages you can import are \`zod\`, \`drizzle-orm\` and \`@dust/pod\`. Other npm packages
are not available at build time.

#### Persisting state across calls

A function's process can read and write the Pod's file system exactly like the Computer does,
under \`/files/pod-<podId>\` (or through the \`files\` MCP server, scoped to \`pod-<podId>/<rel>\`). Anything
written there persists across calls and conversations, not just for the duration of one
invocation.

Functions of the same Pod can share durable SQLite databases (via \`drizzle-orm\`):
- **One schema file per database** at \`databases/{db}.db.ts\`, relative to the sources: the single
  source of truth declaring that database's full schema with drizzle's \`sqliteTable\` DSL. Every
  function imports its table objects from it (never hand-write tables in a function file), so
  functions sharing a database must live in the same source directory.
- **Name functions that use this db.ts by writting a comment a the top** 
- **Apply the schema file with \`${toolName("db_reconcile")}\`**; it creates the database and
  applies additive DDL after edits, and enforces the rules below. Publishing does not touch
  databases; an unreconciled database does not exist at runtime.
- **At runtime open a database with \`db(name)\` from \`@dust/pod\`** and query it with the imported
  table objects.

\`\`\`ts
// databases/chat.db.ts; the full intended schema, shared by every chat function
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  author: text("author"),
  body: text("body"),
  createdAt: integer("created_at", { mode: "timestamp" }),
}, (t) => [index("messages_created_idx").on(t.createdAt)]);

// post-message.ts; declares schema.databases: ["chat"], then inside fetch:
import { db } from "@dust/pod";
import { messages } from "./databases/chat.db.ts";
const row = db("chat").insert(messages)
  .values({ author, body, createdAt: new Date() })
  .returning({ id: messages.id }).get();
\`\`\`

Column \`mode\` (\`"timestamp" | "boolean" | "json" | ...\`) is the row-to-JS (de)serialization; keep it identical across functions by always importing the shared schema file.

**Evolution is additive-only.** Reconcile can only ADD tables, columns, and indexes; nothing is
dropped, renamed, or retyped (indexes excepted, and it rejects a destructive schema file). Get
names and types right up front, and:

- make columns nullable by default; never add a NOT NULL column without a \`.default(...)\`;
- no premature unique indexes (a late \`uniqueIndex()\` fails if rows already duplicate);
- no foreign keys (\`.references()\`), CHECK or UNIQUE constraints; use \`uniqueIndex()\` and enforce
  integrity in code;
- give every table an \`id\` and a \`createdAt\`;
- to change a shape, add alongside: a new nullable column read with a fallback, or a new table
  preferred over the old on read.

A function's \`fetch\` handler runs as the same egress-controlled user as the Computer's bash
tool, so \`fetch()\` calls from inside it only reach domains on the pod's egress allowlist, and the
workspace's \`DST_*\` (plain config) and \`DSEC_*\` (HTTPS secret placeholder) environment variables
are available under the same substitution rules as the Computer.

#### Performance rules

Design the function contract around the Frame interaction, not individual database tables:

- make reads idempotent and side-effect-free, and return one bounded screen snapshot instead of
  creating waterfalls or N+1 calls;
- make mutations return the updated entity or screen snapshot so the Frame can update its cache
  without another function call;
- keep write operations safe against duplicate interaction, using a stable idempotency key when a
  repeated request would otherwise create duplicate data.


#### Calling other tools from a function

\`dsbx\` is available inside a function's own process, the same way it is in the conversation's
Computer: shell out to \`dsbx tools --json [SERVER_NAME] [TOOL_NAME] [ARGS]...\` and parse its
stdout (\`{ content, isError }\`) for the result.
Run \`dsbx tools --help\` from the Computer to explore available
servers and tools before writing the function.

#### Publishing, discovering, and invoking

Once the source is on the Pod, use \`${toolName("publish")}\` to build it. Publishing bundles and
type-checks the source on the Computer and extracts the input and output JSON schemas from the
\`schema\` export. Publishing again under the same name replaces the previous version. The stored
bundle is owned by the platform and runs from a read-only mount, so a published function can be
executed but never overwritten from within the Computer.

Use \`${toolName("list")}\` and \`${toolName("get")}\` to see what the Pod has already
published and to inspect a function's contract before relying on it or publishing a near-duplicate.

Call a published function directly from this conversation with \`${toolName("call")}\`, passing
its slug and an input payload matching its \`get\`-reported input schema. Call it yourself whenever
you need the result now rather than asking a Frame to fetch it for you.

To debug a function, use \`${toolName("inspect_invocations")}\` to inspect its most recent inputs,
results, errors, statuses, and timestamps.

The live databases have their own tools: \`${toolName("db_list")}\` (sizes),
\`${toolName("db_schema")}\` (live storage types only; column modes exist only in the authored
file), \`${toolName("db_query")}\` (one SQL statement; no schema changes; a result too large to
return inline is written to a pod file whose path it reports), and \`${toolName("db_reconcile")}\`
(apply an edited \`databases/{db}.db.ts\`). See each tool's description for its arguments.

#### Calling a function from a Frame

A Frame calls published functions through the injected \`@dust/react-hooks\` module, not the
\`call\` tool. Always pass the fully qualified \`<podId>/<slug>\` reference reported by
\`${toolName("get")}\`. Never pass a bare slug or infer the function from the Frame's current Pod.
This keeps the reference stable if the Frame is moved.

Use \`usePodFunction\` for idempotent reads. It caches identical calls, deduplicates calls already
in flight, and keeps previous data visible while revalidating. Pass \`null\` as the reference to
disable the query.

\`\`\`tsx
import { usePodFunction } from "@dust/react-hooks"

const { data, error, isLoading, isValidating, mutate } = usePodFunction(
  "<podId>/list-comments",
  { threadId }
)
\`\`\`

Use \`usePodFunctionMutation\` for writes and other side effects. Mutations only run when
\`trigger\` is called. They are not deduplicated and do not guess which cached queries they affect.
Prefer mutation functions whose output matches the affected read snapshot, then write that result
to the query cache without revalidating.

\`\`\`tsx
import { usePodFunction, usePodFunctionMutation } from "@dust/react-hooks"

const comments = usePodFunction("<podId>/list-comments", { threadId })
const addComment = usePodFunctionMutation("<podId>/post-comment")

async function handleAddComment(body: string) {
  const updatedComments = await addComment.trigger({ threadId, body })
  await comments.mutate(updatedComments, { revalidate: false })
}
\`\`\`

For immediate feedback, apply an optimistic cache update before triggering the mutation and replace
it with the authoritative mutation result afterward. Roll the optimistic value back if the mutation
fails. Only call \`mutate()\` without data when the mutation cannot return the affected state; do not
make a blocking mutation-then-refetch sequence the default.

Do not poll every second. Prefer event-driven invalidation; when polling is unavoidable, use an
interval of at least 5–10 seconds, pause while the document is hidden, add jitter/backoff, and never
start a new request while the previous one is still running.

Call mutation handlers from a button or another supported in-Frame interaction. Do not model this
as HTML form submission because forms cannot run inside the Frame iframe.

Inspect each function with \`${toolName("get")}\` before writing the Frame and follow both reported
schemas. Before success, hook \`data\` is \`undefined\`. After success, it contains the parsed JSON
value described by \`schema.output\`. Mutation \`trigger\` accepts \`schema.input\` and resolves to
the parsed and validated value described by \`schema.output\`.

Function call failures are normalized as \`SandboxFunctionCallError\` instances, also exported by
\`@dust/react-hooks\`. Query failures are exposed through \`error\`. Mutation failures update
\`error\` and reject \`trigger\`. Each error carries a \`message\`, an optional HTTP \`status\`, and
a \`code\`. Render loading and error states like for any other network call. Treat \`code\` as an
open string because it is whatever classified the failure. Branch on the codes you handle and
fall back to a generic message for the rest. The ones worth branching on are \`invalid_input\` and
\`invalid_output\` for schema mismatches, \`threw\` when the function threw, \`http_error\` when the
function's own request failed, \`sandbox_function_not_found\`, and \`not_supported\`.

Pod functions are only reachable from authenticated Pod Frames, not from public or shared Frames.`,
  mcpServers: [{ name: SANDBOX_FUNCTIONS_SERVER_NAME }],
  version: 5,
  icon: "PuzzleIcon",
  isRestricted: async (auth: Authenticator) => {
    const flags = await getFeatureFlags(auth);

    return !flags.includes("sandbox_functions");
  },
  // Functions are Pod-scoped, so the skill is hidden outside a Pod conversation.
  isDisabledForAgentLoop: (agentLoopData) =>
    !agentLoopData.conversation ||
    !isPodConversation(agentLoopData.conversation),
  // Equipped in Pod conversations but not auto-enabled.
  getAutoEnabledOrEquippedForAgentLoop: () => "equipped",
} as const satisfies GlobalSkillDefinition;
