import { SANDBOX_FUNCTIONS_SERVER_NAME } from "@app/lib/api/actions/servers/sandbox_functions/metadata";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import { isPodConversation } from "@app/types/assistant/conversation";

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

- export a \`schema\` object with a \`description\` and zod \`input\` and \`output\` schemas (plus a
  \`databases\` list when the function uses pod databases, see below),
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
imported helper (including a database schema file) has no effect until you re-publish.

The external packages you can import are \`zod\`, \`drizzle-orm\` and \`@dust/pod\`. Other npm packages
are not available at build time.

#### Pod databases: durable shared state

Functions of the same Pod can share durable SQLite databases. The contract has four parts:

1. **One schema file per database** at \`databases/{db}.db.ts\`, relative to the function sources
   — functions sharing a database must live in the same source directory so they all import the
   same file. It is the single source of truth: it declares the FULL intended schema of that
   database with drizzle's \`sqliteTable\` DSL, and every function imports its table objects from
   it. Never hand-write table objects inside a function file.
2. **Each function declares the databases it opens** in \`schema.databases: ["chat"]\`. Database
   names are lowercase \`[a-z][a-z0-9_]*\`.
3. **Apply the schema file with the \`db_reconcile\` tool** — it creates the database on its
   first run and applies additive DDL after edits. Publish validates schema files but never
   applies them: an unreconciled database does not exist at runtime.
4. **At runtime, open a database with \`db(name)\` from \`@dust/pod\`** and query it with the
   imported table objects.

\`\`\`ts
// databases/chat.db.ts — the full intended schema of chat.db, shared by every chat function
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    author: text("author"),
    body: text("body"),
    attachments: text("attachments", { mode: "json" }).$type<string[]>(),
    createdAt: integer("created_at", { mode: "timestamp" }),
  },
  (t) => [index("messages_created_idx").on(t.createdAt)]
);
\`\`\`

\`\`\`ts
// post-message.ts
import { z } from "zod";
import { db } from "@dust/pod";
import { messages } from "./databases/chat.db.ts";

export const schema = {
  description: "Post a message.",
  databases: ["chat"],
  input: z.object({ author: z.string(), body: z.string() }),
  output: z.object({ id: z.number() }),
};

export default {
  async fetch(request: Request): Promise<Response> {
    const { author, body } = await request.json();
    const row = db("chat")
      .insert(messages)
      .values({ author, body, createdAt: new Date() })
      .returning({ id: messages.id })
      .get();
    return Response.json(row);
  },
};
\`\`\`

Column modes (\`{ mode: "timestamp" | "timestamp_ms" | "boolean" | "json" | ... }\`) are the
row-to-JS (de)serialization contract — they turn SQLite's light storage types into Dates, booleans
and parsed JSON. Keep them identical across every function of a database by always importing from
the shared schema file.

#### Get the first schema right — evolution is additive-only

Schema changes can only ADD: new tables, new columns, new indexes. No table or column is ever
dropped, renamed, or retyped — reconcile rejects those changes to protect data and the other
published functions (indexes are the exception: they can be added and dropped). First-schema
quality therefore determines how often you hit that wall:

- get table and column NAMES and TYPES right up front (renames are not possible later);
- make columns nullable by default — add \`.notNull()\` only when certain, and never add a
  NOT NULL column without a \`.default(...)\` to an existing table;
- no premature unique indexes — a unique index added later makes sibling writes fail, and
  creating it fails outright if existing rows already contain duplicates;
- give every table an \`id: integer("id").primaryKey({ autoIncrement: true })\` and a
  \`createdAt\` timestamp;
- NO foreign keys (\`.references()\`), CHECK constraints or UNIQUE constraints (\`.unique()\` or
  table-level \`unique()\` — use \`uniqueIndex()\` instead, SQLite cannot add or drop a UNIQUE
  constraint later without a table rebuild) — they are rejected at build time; enforce
  relational integrity in function code.

When a shape must change anyway, evolve additively:

- **new column**: add it nullable (or with a default), write it going forward, and read with a
  fallback: \`row.newColumn ?? deriveFromOldColumn(row)\`;
- **replacing a column (e.g. rename)**: ADD the new column, keep the old one declared; publish
  writers that dual-write both, readers that prefer the new and fall back to the old; only then
  republish the remaining functions;
- **outgrowing a JSON column**: add a proper table alongside it; new writes go to the table,
  readers prefer table rows and fall back to the JSON column for history.

#### Applying schema changes

Publishing validates each declared database's schema file (the rejections above) but never
touches the live databases. Schema changes reach a live database only through the
\`db_reconcile\` tool — run it after editing \`databases/{db}.db.ts\` (a database is created on
its first reconcile; \`db()\` opens must-exist). It applies additive DDL only:

- "destructive changes are not allowed through reconcile" — the schema file drops something that
  exists in the live database. Restore the missing table or column declarations and evolve
  additively instead.
- Nothing cross-checks the other published functions: a schema change that reconciles cleanly
  can still break a sibling at runtime (a unique index added late, a column mode changed in one
  copy of a schema file). The additive rules above are what prevents this — follow them, and
  keep every function of a database importing the same schema file.

A function's \`fetch\` handler runs as the same egress-controlled user as the Computer's bash
tool, so \`fetch()\` calls from inside it only reach domains on the pod's egress allowlist, and the
workspace's \`DST_*\` (plain config) and \`DSEC_*\` (HTTPS secret placeholder) environment variables
are available under the same substitution rules as the Computer.

#### Persisting state across calls

A function's process can read and write the Pod's file system exactly like the Computer does,
under \`/files/pod-<podId>\` (or through the \`files\` MCP server, scoped to \`pod-<podId>/<rel>\`). Anything
written there persists across calls and conversations, not just for the duration of one
invocation.

#### Calling other tools from a function

\`dsbx\` is available inside a function's own process, the same way it is in the conversation's
Computer: shell out to \`dsbx tools --json [SERVER_NAME] [TOOL_NAME] [ARGS]...\` and parse its
stdout (\`{ content, isError }\`) for the result.
Run \`dsbx tools --help\` from the Computer to explore available
servers and tools before writing the function.

#### Publishing, discovering, and invoking

Once the source is on the Pod, use the \`publish\` tool to build it. Publishing bundles and
type-checks the source on the Computer and extracts the input and output JSON schemas from the
\`schema\` export. Publishing again under the same name replaces the previous version. The stored
bundle is owned by the platform and runs from a read-only mount, so a published function can be
executed but never overwritten from within the Computer.

Use the \`list\` and \`get\` tools to see what the Pod has already published and to inspect a
function's contract before relying on it or publishing a near-duplicate.

Call a published function directly from this conversation with the \`call\` tool, passing its slug
and an input payload matching its \`get\`-reported input schema. Use \`call\` yourself whenever you
need the result now rather than asking a Frame to fetch it for you.

The live databases have tools of their own: \`db_list\` shows them with sizes, \`db_schema\`
regenerates a database's live schema (storage types only — column modes exist only in the
authored schema file), \`db_query\` runs one SQL statement (SELECT or INSERT/UPDATE/DELETE;
schema changes are rejected), and \`db_reconcile\` applies an edited databases/{db}.db.ts to the
live database (additive DDL only). See each tool's own description for its arguments.

#### Calling a function from a Frame

A Frame calls a published function through the injected \`@dust/react-hooks\` module, not the
\`call\` tool. Unlike \`call\`/\`get\`/\`list\`/\`publish\`, which take the bare slug because they
already operate within the current Pod, a Frame has no implicit Pod context and must address the
function by its fully qualified slug: \`<podId>/<slug>\`, where \`podId\` is the same id that appears
in Pod file paths as \`pod-<podId>/...\`, with the \`pod-\` prefix dropped. Neither the bare slug nor
the mount-path form \`pod-<podId>/<slug>\` resolves from a Frame.

\`\`\`ts
import { callFunction } from "@dust/react-hooks";

const { result, error } = await callFunction("<podId>/<slug>", input);
\`\`\`

\`input\` must match the function's declared input schema (see \`get\`). Check \`error\` and render
loading/error state, since this is a network call like any other in the Frame. \`result\` is
currently the raw sandbox runner envelope (\`{ ok, response: { status, body, encoding, ... } }\`)
rather than the parsed \`schema.output\`, so parse \`response.body\` yourself. Sandbox functions are
only reachable from authenticated Pod Frames, not from public or shared Frames.`,
  mcpServers: [{ name: SANDBOX_FUNCTIONS_SERVER_NAME }],
  version: 2,
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
