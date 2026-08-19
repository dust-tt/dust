import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  FILES_MOVE_ACTION_NAME,
  FILES_SERVER_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
import {
  CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  INTERACTIVE_CONTENT_SERVER_NAME,
  PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
} from "@app/lib/api/actions/servers/interactive_content/metadata";
import type { SANDBOX_FUNCTIONS_TOOLS_METADATA } from "@app/lib/api/actions/servers/sandbox_functions/metadata";
import { SANDBOX_FUNCTIONS_SERVER_NAME } from "@app/lib/api/actions/servers/sandbox_functions/metadata";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import { isPodConversation } from "@app/types/assistant/conversation";

function toolName(
  name: (typeof SANDBOX_FUNCTIONS_TOOLS_METADATA)[number]["name"]
): string {
  return getPrefixedToolName(SANDBOX_FUNCTIONS_SERVER_NAME, name);
}

const FILES_MOVE_TOOL = getPrefixedToolName(
  FILES_SERVER_NAME,
  FILES_MOVE_ACTION_NAME
);
const CREATE_FRAME_TOOL = getPrefixedToolName(
  INTERACTIVE_CONTENT_SERVER_NAME,
  CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME
);
const PUBLISH_FRAME_TOOL = getPrefixedToolName(
  INTERACTIVE_CONTENT_SERVER_NAME,
  PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME
);

export const POD_FUNCTIONS_SKILL_NAME = "Pod Functions";

export const podFunctionsSkill = {
  sId: "pod_functions",
  kind: "global",
  name: POD_FUNCTIONS_SKILL_NAME,
  userFacingDescription:
    "Run hosted functions on the Pod's Computer that can persist data and call other tools.",
  agentFacingDescription:
    "A pod function is a hosted function that runs on the Pod's own Computer, shared across " +
    "every conversation in the Pod, with the ability to persist data and call other tools. It's " +
    "callable by slug from this conversation or from a Frame's own runtime. This is how a Frame " +
    "stores data: use it whenever a Frame's content must survive a reload and be the same for " +
    "everyone who opens it (a task list, tracker, backlog, inventory, log, notes app, or any " +
    "Frame whose entries users add and expect to find again), or whenever a Frame needs a " +
    "server-side capability it cannot hold itself, such as calling another tool or using a " +
    "workspace secret.",
  instructions: `Pod functions are versioned, typed functions published on the Pod's own
Computer: a persistent environment shared across every conversation in the Pod, not the one
scoped to this conversation. Each one is a TypeScript module with zod-typed input and output,
bundled at publish time and reusable across conversations in the same Pod, callable from a
Frame's own runtime or directly from this conversation with the call tool described below.

Reach for a pod function instead of inline code or an ad hoc tool call when any of these apply:

- A Frame needs a server-side capability it cannot run inside its own browser sandbox: calling
  another workspace tool, using a workspace secret, or logic no client-side code should hold
  (see "Calling other tools from a function" below).
- Data needs to persist beyond one call: files on the Pod, or rows in a SQLite database, are
  there on the next call and visible to a Frame that always reflects the latest state (see
  "Persisting state across calls" below).

#### Laying out a Pod app

A Frame and the pod functions behind it are one app. Keep the whole app in a single folder on the
Pod file system rather than splitting it between the conversation and the Pod root:

\`\`\`
/files/pod-<podId>/
  MyApp/
    MyApp.tsx          the Frame's source; its directory is the Frame's bundling root
    functions/
      list-notes.ts    one file per function, named after the function; the app folder
                       above becomes the published slug's prefix (myapp__list-notes)
      post-note.ts
      lib/
        notes.ts       helpers shared by several functions
    databases/
      notes.db.ts      one shared drizzle schema file per database
\`\`\`

Nothing the app owns stays in the conversation file system: a conversation file belongs to one
conversation, while the app is shared by every conversation in the Pod, exactly like the functions
it publishes. If the app's Frame does not exist yet, or still sits in the conversation, the Frames
skill covers creating it and moving it into the app folder with \`${FILES_MOVE_TOOL}\` before
\`${PUBLISH_FRAME_TOOL}\`; \`${CREATE_FRAME_TOOL}\` always creates it in the conversation first.

Functions that no Frame calls still get an app folder, named after what they do together.

**Copying an app folder still needs two steps of its own.** The databases and the published slugs
follow the new folder, but nothing is live until you publish the copy's functions and reconcile its
databases. After copying \`MyApp/\` to \`MyAppCopy/\`, do both, and the copy is a separate app with its
own data. Renaming an app folder is the same.

The copy's Frame needs no edit **as long as it refers to its own functions by bare name** (see
"Calling a function from a Frame"), because those references resolve against whichever app folder the
Frame ends up in. A Frame that instead hard-codes \`<podId>/myapp__list-notes\` keeps calling the
ORIGINAL app's functions after the copy, and so reads and writes the original's data: rewrite those
references to bare names and re-publish it.

#### Authoring a function

Write the source as a TypeScript file in the app's \`functions\` folder, at
\`pod-<podId>/<AppName>/functions/<name>.ts\` (the Computer mounts it at
\`/files/pod-<podId>/<AppName>/functions/<name>.ts\`; the \`files\` MCP server reaches it under the
same scoped path). Keep it in an app folder: that folder is what namespaces the function, and a
source left at the Pod root publishes under its bare name instead. The module must:

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

Keep a function file to its own endpoint and put anything two functions both need in
\`functions/lib/\`: validation, formatting, an external API client, a query several endpoints run.
Import helpers with relative paths (\`import { parse } from "./lib/parse.ts"\`). Before writing a
helper, read what \`functions/lib/\` already has and extend it rather than adding a near-duplicate;
when a second function needs logic that currently sits inline in the first, move it to
\`functions/lib/\` instead of copying it.

Publishing bundles the entrypoint and all of its relative imports into one module, so each
published function carries its own copy of the helpers it uses. The bundle is a snapshot taken at
publish time: editing a helper changes nothing until you re-publish, and re-publishing one consumer
leaves the others on the old copy. After changing a shared helper, re-publish every function that
imports it.

The external packages you can import are \`zod\`, \`drizzle-orm\` and \`@dust/pod\`. Other npm packages
are not available at build time.

#### Persisting state across calls

A function's process can read and write the Pod's file system exactly like the Computer does,
under \`/files/pod-<podId>\` (or through the \`files\` MCP server, scoped to \`pod-<podId>/<rel>\`). Anything
written there persists across calls and conversations, not just for the duration of one
invocation.

Functions of the same Pod can share durable SQLite databases (via \`drizzle-orm\`):
- **One schema file per database** at \`<AppName>/databases/{db}.db.ts\`: the single source of truth
  declaring that database's full schema with drizzle's \`sqliteTable\` DSL. Every function imports
  its table objects from it as \`../databases/{db}.db.ts\` (never hand-write tables in a function
  file), so functions sharing a database belong to the same app. Name the database for what it
  holds within the app (\`chat\`, \`notes\`), not for the app: the app folder namespaces it, so two
  apps can each own a \`chat\` without colliding. Never write the app name in \`db()\` or the schema
  file — the prefix is applied for you from the app folder. \`${toolName("db_list")}\` shows the
  resulting on-disk names (\`myapp__chat\`), which is how the db tools address a database; \`db()\`
  and the schema file always use the short name.
- **Name functions that use this db.ts by writting a comment a the top** 
- **Apply the schema file with \`${toolName("db_reconcile")}\`**; it creates the database and
  applies additive DDL after edits, and enforces the rules below. Publishing does not touch
  databases; an unreconciled database does not exist at runtime.
- **At runtime open a database with \`db(name)\` from \`@dust/pod\`** and query it with the imported
  table objects.

\`\`\`ts
// MyApp/databases/chat.db.ts; the full intended schema, shared by every chat function
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  author: text("author"),
  body: text("body"),
  createdAt: integer("created_at", { mode: "timestamp" }),
}, (t) => [index("messages_created_idx").on(t.createdAt)]);

// MyApp/functions/post-message.ts; declares schema.databases: ["chat"], then inside fetch:
import { db } from "@dust/pod";
import { messages } from "../databases/chat.db.ts";
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

#### Calling other tools from a function

Prefer \`tools.call(server, tool, args)\` from \`@dust/pod\`. It sends \`args\` as one JSON
object, without shell quoting, per-field temporary files, or scalar coercion. If you must shell out,
use \`dsbx tools --json --args-json - [SERVER_NAME] [TOOL_NAME]\` and write the whole arguments
object as JSON to stdin. Run \`dsbx tools --help\` from the Computer to explore available servers
and tools before writing the function.

The outer \`ToolCallResult\` is stable (\`content\`, \`isError\` and optional
\`structuredContent\`), but the content blocks inside are tool-specific. Check \`isError\`, prefer
\`structuredContent\` when present, and use \`result.json()\` only when the tool guarantees one JSON
payload. For mixed prose and data, select the documented machine-readable block from
\`result.content\`, then parse and validate the expected schema. Keep this normalization in one
helper per integration.

\`tools.call()\` and \`dsbx tools --json\` resolve offloaded blocks automatically. Never parse a
human \`[Full content archived at ...]\` marker or manually read its path. A
\`tool_output_unavailable\` error is retryable. Any function that calls a workspace tool must be
published as \`durable\`, see below.

#### Fast and durable functions

Every function is published in one of two execution modes, and which one it needs shapes how you
split functions up.

- \`fast\`: runs synchronously and returns several times quicker, but **cannot call workspace
  tools** through \`tools.call\` or \`dsbx tools\`. Everything else still works, including Pod state,
  local binaries and outbound HTTP calls, but those count against the invocation's execution
  ceiling, so a fast function that waits on a slow endpoint will fail rather than return late.
- \`durable\`: required for any function that calls a workspace tool. A tool call can wait on the user
  for approval or authentication, for as long as they take, so the invocation runs in the
  background and its result reaches the caller when it is ready.

So the shape of your functions is the real decision:

- The mode follows one question: does the function call a workspace tool? If it does it is \`durable\`,
  if it does not it is \`fast\`. You do not get to choose that, but you do choose how to arrange
  functions, and the aim is that the paths a Frame polls land on the fast side.
- When a path the Frame polls needs data from an external system, do not fetch it inline and make
  the whole path \`durable\`. Split it: a \`durable\` function calls the tool and writes what it
  gets into a database, and a \`fast\` function serves that database to the Frame. The Frame keeps
  polling at full speed and the data refreshes on its own schedule, or on an explicit user action.
- Some paths are \`durable\` and that is correct: a read that must be live on every call, or an
  interaction that *is* a tool call, like sending a message to a teammate. Reach for the split
  above when the data can tolerate being a little stale, not when it cannot.
- Publishing a function that calls a workspace tool as \`fast\` is a bug: its tool call is refused at
  run time and the invocation fails.

The Frame API is identical for both, but a \`durable\` call takes visibly longer, so give it a
loading state.

#### Publishing, discovering, and invoking

Once the source is on the Pod, use \`${toolName("publish")}\` to build it. It requires you to state
\`executionMode\` on every publish. Publishing bundles and type-checks the source on the Computer
and extracts the input and output JSON schemas from the \`schema\` export. The stored bundle is owned
by the platform and runs from a read-only mount, so a published function can be executed but never
overwritten from within the Computer.

**The published slug is \`<app>__<name>\`.** You pass the bare \`<name>\`; publish derives the prefix
from the app folder in \`path\` (\`TaskList\` becomes \`tasklist\`, \`Task List\` becomes \`task-list\`) and
reports the full slug back. Use that reported slug for the tools that address the function:
\`${toolName("get")}\`, \`${toolName("call")}\` and \`${toolName("unpublish")}\`. A Frame in the same
app is the exception and uses the bare \`<name>\` instead, see "Calling a function from a Frame".
Only the app folder
contributes, so \`functions/\` and any folder nested under it never appear in the slug, and moving a
source inside its app does not rename the function. A source at the Pod root has no app folder and
keeps its bare name; moving it into one later *does* rename its function, leaving the old slug
published and stale, so put it in its app folder from the start.

Publishing again under the same app and name replaces that version. Two different apps can each
publish a \`refresh\` and they stay separate functions, so you never have to invent
\`refresh-tasklist\` to dodge a clash.

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
\`call\` tool. There are two ways to name a function, and which one you use matters:

- **A Frame inside an app folder refers to its own app's functions by bare name**: pass
  \`add-task\`, the same name you passed to \`${toolName("publish")}\`, with no Pod and no app
  prefix. The reference resolves against the app folder the Frame itself lives in, so the app stays
  copyable: a copy's Frame calls the copy's functions with no edit to its source. Use this for every
  function the Frame's own app publishes.
- **Anything else takes the fully qualified \`<podId>/<slug>\` reference** reported by
  \`${toolName("get")}\`, app prefix included (\`<podId>/tasklist__add-task\`). This is the only way
  to reach a function in another app or another Pod, and it is what a Frame that does not live in an
  app folder must use for everything.

Never write your own app's prefix into a reference. \`tasklist__add-task\` with no Pod is not a
shorthand and is refused: inside the app use \`add-task\`, outside it use the full
\`<podId>/tasklist__add-task\`.

##### Designing functions for a Frame

Design the function contract around the Frame interaction, not individual database tables:

- make reads idempotent and side-effect-free, and return one bounded screen snapshot instead of
  creating waterfalls or N+1 calls;
- make mutations return the updated entity or screen snapshot so the Frame can update its cache
  without another function call;
- keep write operations safe against duplicate interaction, using a stable idempotency key when a
  repeated request would otherwise create duplicate data.

Use \`usePodFunction\` for idempotent reads. It caches identical calls, deduplicates calls already
in flight, and keeps previous data visible while revalidating. Pass \`null\` as the reference to
disable the query.

\`\`\`tsx
import { usePodFunction } from "@dust/react-hooks"

const { data, error, isLoading, isValidating, mutate } = usePodFunction(
  "list-comments",
  { threadId }
)
\`\`\`

Use \`usePodFunctionMutation\` for writes and other side effects. Mutations only run when
\`trigger\` is called. They are not deduplicated and do not guess which cached queries they affect.
Prefer mutation functions whose output matches the affected read snapshot, then write that result
to the query cache without revalidating.

\`\`\`tsx
import { usePodFunction, usePodFunctionMutation } from "@dust/react-hooks"

const comments = usePodFunction("list-comments", { threadId })
const addComment = usePodFunctionMutation("post-comment")

async function handleAddComment(body: string) {
  const updatedComments = await addComment.trigger({ threadId, body })
  await comments.mutate(updatedComments, { revalidate: false })
}
\`\`\`

For immediate feedback, apply an optimistic cache update before triggering the mutation and replace
it with the authoritative mutation result afterward. Roll the optimistic value back if the mutation
fails. Only call \`mutate()\` without data when the mutation cannot return the affected state; do not
make a blocking mutation-then-refetch sequence the default.

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

Pod functions in shared Frames are available to authenticated members of the Pod's workspace;
anonymous viewers cannot call them. When a function is declared \`"pod_member_required"\`, have the
Frame gate the affordance on \`useUserIdentity\`'s \`isPodMember\` flag so non-members are not
shown a button that can only fail; the flag is display-only and the policy is what enforces.

#### Knowing who called a function

A function can require a caller and read who they are. These are two separate things: the
\`schema.userIdentity\` policy decides **whether the function runs at all**, and \`currentUser()\`
decides **what it does** for the caller it got.

Declare the policy alongside the input and output schemas:

- \`"optional"\` (the default when you omit the field) runs the function with or without a user.
  It does not hide the caller: \`currentUser()\` still returns whoever called, and only returns
  \`null\` when the invocation genuinely has no user. Use it when the function should still answer
  a userless caller, and personalize from \`currentUser()\` when there happens to be one.
- \`"workspace_user_required"\` refuses the call unless it comes from a current member of the Pod's
  workspace. Use it as soon as the function reads or writes anything that belongs to a person, or
  performs an action that should be attributable.
- \`"pod_member_required"\` further requires the caller to belong to the Pod itself (its member or
  editor group; workspace admins outside those groups are refused). Use it when the function
  mutates the Pod's state and bystanders of an open Pod should only look.
- \`"interactive_workspace_user_required"\` requires the call to come directly from a workspace
  member's live Dust session, refusing agents, schedules, and API clients acting on the member's
  behalf. Use it for consequential actions that a human must click themselves.

\`\`\`ts
import { z } from "zod";
import { currentUser } from "@dust/pod";

export const schema = {
  description: "List the notes belonging to the calling user.",
  userIdentity: "workspace_user_required",
  input: z.object({}),
  output: z.object({ notes: z.array(z.object({ id: z.number(), body: z.string() })) }),
};
\`\`\`

Inside \`fetch\`, \`currentUser()\` from \`@dust/pod\` returns the caller as
\`{ sId, firstName, lastName, fullName, image, isPodMember, isPodEditor }\`, or \`null\` when the
invocation has no user. \`isPodMember\` says whether the caller belongs to the Pod (member or
editor group); \`isPodEditor\` whether they are an editor or a workspace admin. These are resolved
by the platform per invocation, so they are trustworthy inputs for branching — e.g. a function
open to the whole workspace can still reserve one code path for Pod members.
Under \`"workspace_user_required"\` the platform has already rejected userless calls, so a
non-null user is guaranteed; under \`"optional"\` you must handle \`null\` yourself.

The membership is re-checked against the Pod's workspace when the invocation runs, not just when
it is queued, so a user removed from the workspace in between is refused.

**Never take the caller's identity as an input.** An \`input\` field like \`userId\` is supplied by
whoever calls the function and can name anyone. \`currentUser()\` is the only trustworthy source.

This matters most when a Frame calls the function. A Frame can read its viewer with
\`useUserIdentity\`, but that is for what it displays; it decides nothing. The function resolves its
own caller, so never accept an identity the Frame sends, and put the check that actually restricts
something here rather than in the interface that renders the button.

\`\`\`ts
// BAD: any caller can pass someone else's id.
input: z.object({ userId: z.string() })

// GOOD: the platform decides who the caller is.
const user = currentUser();
\`\`\`

#### Per-user state and sessions

Scope rows by \`currentUser().sId\`, which is stable for a user across calls, conversations, and
Frames. That single column is what turns a shared Pod database into per-user state, so add it when
you create the table rather than retrofitting it later (schema evolution is additive-only).

\`\`\`ts
// MyApp/databases/notes.db.ts
export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id"),        // currentUser().sId
  body: text("body"),
  createdAt: integer("created_at", { mode: "timestamp" }),
}, (t) => [index("notes_user_idx").on(t.userId)]);

// MyApp/functions/list-notes.ts, declared "workspace_user_required"
const user = currentUser();
const rows = db("notes").select().from(notes).where(eq(notes.userId, user.sId)).all();
\`\`\`

Filter by \`userId\` on **every** read and write, not only on the read that renders the screen: a
function that fetches a row by its primary key and then updates it must still check the row belongs
to the caller, otherwise a guessed id reaches another user's data.

Split capabilities across functions rather than branching inside one. A \`list-notes\` and a
\`delete-note\` published separately can carry different policies and are each easy to reason about;
one \`notes\` function taking an \`action\` field is not. If a capability must be restricted to an
app-specific subset of users, keep that list in the database and check it against
\`currentUser().sId\` — the platform tells you the caller's standing (workspace member, Pod
member, Pod editor), not what your app allows them to do.`,
  mcpServers: [{ name: SANDBOX_FUNCTIONS_SERVER_NAME }],
  version: 9,
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
