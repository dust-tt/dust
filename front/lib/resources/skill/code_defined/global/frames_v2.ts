import { INTERACTIVE_CONTENT_AUTHORING_PROSE_V2 } from "@app/lib/api/actions/servers/interactive_content/instructions_v2";
import { MAX_FRAME_DATABASE_COUNT } from "@app/types/api/frame_manifest";

export const FRAMES_V2_INSTRUCTIONS = `\
# Frames v2

Frames are interactive React applications. Use the Computer to create and edit their source, and
the \`dsbx frame\` CLI for their lifecycle.

## Frames v2 vs legacy Frames

- A Frames v2 source is a package-like folder anchored by \`manifest.json\`. The registered
  manifest is the canonical Frame resource; its folder contains the UI source, assets, and
  function source. The manifest declares one UI entry point (\`index.tsx\` by default) and every
  server function. Publishing snapshots the whole folder, builds every declared function, and
  atomically activates the publication.
- A legacy (v1) Frame is anchored by a single \`.tsx\` entry file. Publishing resolves that entry
  file and its local imports, then updates the existing Frame through the legacy bundle pipeline.
- \`dsbx frame publish\` supports both formats. Edit and publish an existing legacy Frame in place;
  do not recreate it just to make it v2.

## Before authoring

Decide whether the Frame is a throwaway visualization or an application with durable state before
writing source. Chat apps, task lists, trackers, forms, CRUD apps, and anything users can change
default to durable: declare the database plus the read and mutation functions in the
manifest. Do not store durable application state in memory; use a Frame database.

## Create a Frame

Use the Computer to create and register a new Frame folder:

\`\`\`bash
dsbx frame create /files/conversation-<conversationId>/<frame-folder> --name "<name>"
\`\`\`

In a Pod, create it under \`/files/pod-<podId>/...\` instead. The command scaffolds
\`manifest.json\` and \`index.tsx\`, then assigns the Frame's stable identity. Edit the generated
source before publishing it.

Always pass canonical \`/files/conversation-<conversationId>/...\` or
\`/files/pod-<podId>/...\` paths to \`dsbx frame\`. Do not pass the convenience aliases
\`/files/conversation\` or \`/files/pod\`.

## Register an existing Frame folder

When \`manifest.json\` and its source folder already exist but do not have a Frame identity, run:

\`\`\`bash
dsbx frame register /files/<scope>/<frame-folder>/manifest.json
\`\`\`

Registration validates the manifest and assigns its stable Frame identity. Repeating the command
for the same manifest path returns the same Frame. Registration does not publish the source.

## Retrieve a registered Frame's share link

Frame sharing and use rights are configured by the user in the Dust UI. Agents must not change
the share scope or grant access to recipients. The CLI can only retrieve an existing share link:

\`\`\`bash
dsbx frame share-link /files/<scope>/<frame-folder>
\`\`\`

This command is read-only. It never creates sharing state, changes the scope, or adds or removes
recipients. It returns the stable Frame ID, current share scope, and existing share URL. If no share
link exists, ask the user to configure sharing in the Dust UI.

## Frames v2 source layout

Keep one Frame and everything it owns in one folder:

\`\`\`
MyFrame/
  manifest.json
  index.tsx
  functions/
    list-comments.ts
    post-comment.ts
    lib/
      comments.ts
  databases/
    comments.db.ts
\`\`\`

The manifest declares the UI entry point, every server function, and every database:

\`\`\`json
{
  "version": 1,
  "name": "Comments",
  "description": "Read and add comments.",
  "uiEntryPoint": "index.tsx",
  "domains": ["api.example.com"],
  "databases": [
    {
      "name": "comments",
      "schema": "databases/comments.db.ts"
    }
  ],
  "functions": [
    {
      "name": "list-comments",
      "description": "List comments for a thread.",
      "entryPoint": "functions/list-comments.ts",
      "executionMode": "fast",
      "defaultStake": "never_ask"
    },
    {
      "name": "post-comment",
      "description": "Add a comment to a thread.",
      "entryPoint": "functions/post-comment.ts",
      "executionMode": "durable",
      "defaultStake": "low"
    }
  ]
}
\`\`\`

- \`uiEntryPoint\` defaults to \`index.tsx\` when omitted.
- Function names are lower-case alphanumeric segments separated by single hyphens.
- \`entryPoint\` paths are relative to the Frame folder. Keep shared helpers under that folder and
  import them with relative paths.
- Each database declaration names Frame-owned SQLite state and points to its Drizzle schema file.
  Database names start with a lower-case letter and contain only lower-case letters, digits, and
  underscores. A Frame can declare up to ${MAX_FRAME_DATABASE_COUNT} databases.
- \`executionMode\` defaults to \`durable\`. Use \`fast\` when the function never calls a Dust tool;
  use \`durable\` when it calls \`dsbx tools\`.
- \`defaultStake\` defaults to \`low\`. \`never_ask\` runs unattended, \`low\` asks once and can be
  always approved, and \`high\` asks on every call when the function is exposed as a tool.
- \`domains\` lists every exact domain or \`*.example.com\` wildcard the functions make outbound
  HTTPS requests to. Publishing files each one as an egress request that a workspace admin reviews
  (for the Pod when the Frame lives in a Pod, otherwise for the workspace); it never grants access
  on its own, and a domain already allowed is skipped. For a domain discovered after publishing,
  use \`request_egress_domain\` instead of republishing.
- Input, output, and caller-identity schemas belong in the function's TypeScript \`schema\` export,
  not in \`manifest.json\`. The build extracts them from source.

## When to add a server function

Use a Frame function when the UI needs server-side behavior it cannot safely or technically run in
the browser sandbox: calling a Dust tool, using a workspace secret, applying trusted authorization,
or running browser-incompatible logic. Keep presentation, filtering, sorting, and other local UI
behavior in the React component.

Use a Frame-owned database whenever data must survive a reload or be shared by everyone who opens
the Frame: task lists, trackers, backlogs, inventories, logs, notes, comments, form responses, and
anything else users can add, edit, reorder, assign, or delete. Keep only throwaway UI state such as
the selected tab, filter, or sort order in the React component.

## Authoring a function

Each function is a TypeScript module that:

- exports a \`schema\` object with a description and Zod \`input\` and \`output\` schemas, plus an
  optional \`userIdentity\` policy;
- default-exports an object with a \`fetch(request: Request): Promise<Response>\` method. A bare
  default-exported function is invalid.

The request body is validated against \`schema.input\` before \`fetch\` runs. Return JSON matching
\`schema.output\`:

\`\`\`ts
import { z } from "zod";

export const schema = {
  description: "Greet the calling workspace member.",
  userIdentity: "workspace_user_required",
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

Keep each function focused on one endpoint. Put validation, formatting, clients, and other logic
used by several functions in \`functions/lib/\` rather than duplicating it. Define shared Zod domain
schemas once in that folder and import them into each function that uses them. Publishing bundles
each entry point and its relative imports from one source snapshot. Editing any source or helper
changes nothing for viewers until the whole Frame is published again.

\`zod\`, \`drizzle-orm\`, and \`@dust/pod\` are available to function source. Other npm packages are
not guaranteed at build time.

## Persisting state in a Frame database

A Frame owns its SQLite databases independently of its source folder and publications. Publishing
reconciles the declared schemas but does not replace existing data. The runtime mounts neither the
Frame source nor a writable data folder; functions access state only through the declared database
handles.

Keep one complete Drizzle schema file per database under \`databases/\`. Every function that uses a
database imports the same table objects from that file and opens the database by its manifest name:

\`\`\`ts
// databases/comments.db.ts
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const comments = sqliteTable(
  "comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    threadId: text("thread_id").notNull(),
    authorId: text("author_id").notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("comments_thread_idx").on(table.threadId)]
);

// functions/post-comment.ts
import { db } from "@dust/pod";
import { comments } from "../databases/comments.db.ts";

const inserted = db("comments")
  .insert(comments)
  .values({ threadId, authorId, body, createdAt: new Date() })
  .returning()
  .get();
\`\`\`

Do not redefine tables inside function files, hand-write SQL schema changes, or keep durable state
in module globals. The schema file is the source of truth for row serialization too, so keep column
modes identical by always importing its table objects.

Schema evolution is additive-only: add tables, columns, and indexes. Do not drop, rename, or retype
existing objects. In particular:

- mark required fields in a newly created table as \`.notNull()\`;
- when adding a column to an existing table, make it nullable or give it a default so existing rows
  remain valid;
- give each table an \`id\` and \`createdAt\`;
- avoid foreign keys, CHECK constraints, and UNIQUE constraints; enforce integrity in code and use
  \`uniqueIndex()\` only when existing rows are known to satisfy it;
- change a shape by adding a new column or table and reading with a fallback.

For per-user state, require a caller, store \`currentUser().sId\`, index that column, and filter by it
on every read and write. Fetching a row by primary key does not prove ownership.

### Fast and durable functions

- \`fast\` runs synchronously and returns sooner, but cannot call Dust tools. Frame databases, local
  computation, local binaries, and allowed outbound HTTP still work, but count against its shorter
  execution ceiling.
- \`durable\` is required for \`dsbx tools\`. Tool calls can wait for user approval or personal
  authentication, so the invocation runs in the background and resumes when the user responds.

The decision is mechanical: if a function calls \`dsbx tools\`, declare it \`durable\`; otherwise
prefer \`fast\`. A durable call is visibly slower, so its UI needs a loading state.

When polled UI data comes from a Dust tool and can be slightly stale, split the path: a durable
function refreshes the Frame database and a fast function serves the stored snapshot. Keep the
whole path durable only when every call must be live or the interaction itself is the tool action.

### Calling Dust tools from a function

Run \`dsbx tools --help\` from the Computer first to discover the exact server, tool, and arguments.
Inside a durable function, shell out to:

\`\`\`bash
dsbx tools --json <server-name> <tool-name> <arguments...>
\`\`\`

Parse the JSON stdout envelope, including \`content\` and \`isError\`. Publishing a function that
calls \`dsbx tools\` as \`fast\` is a bug: the runtime refuses the tool call. Function \`fetch()\`
requests only reach domains on the egress allowlist (workspace, plus the Pod's when the Frame lives
in a Pod), so declare them in the manifest's \`domains\`; \`DST_*\` / \`DSEC_*\` configuration
follows the same rules as the Computer.

### Knowing who called a function

The \`schema.userIdentity\` policy decides whether the function may run:

- \`optional\` is the default and allows calls without a user.
- \`workspace_user_required\` requires a current member of the owning workspace.
- \`interactive_workspace_user_required\` additionally requires the member's live Dust session;
  delegated agents, schedules, and API clients are refused.
- \`frame_author_required\` requires the caller to be able to modify the Frame v2 source files. In a
  standalone conversation this follows conversation access; in a Pod it follows write access to the
  Pod. Use this for author-only or admin functions.
- \`pod_member_required\` remains available for legacy Pod-specific functions. Do not use it for new
  Frame v2 author controls.

Frame UI calls are available only to authenticated members of the owning workspace; guest or link
viewers must get a typed authorization error. A function policy can impose a stricter requirement.

Use \`currentUser()\` from \`@dust/pod\` for the trusted caller. It returns
\`{ sId, firstName, lastName, fullName, image, isPodMember, isPodEditor }\`, or \`null\` under the
optional policy when there is no user. Never accept a caller \`userId\` as function input: the caller
can forge it. The frontend's \`useUserIdentity\` hook also returns \`isFrameAuthor\`; use that flag to
show author-only UI, but enforce every author-only operation with \`frame_author_required\` because
client-side conditions are not access control.

## Calling a function from the Frame UI

Use the historically named \`usePodFunction\` and \`usePodFunctionMutation\` hooks from
\`@dust/react-hooks\`. Refer to the Frame's own functions by their bare manifest name.

Design contracts around UI interactions rather than database tables:

- reads are idempotent and return one bounded screen snapshot instead of creating waterfalls;
- mutations return the updated entity or screen snapshot so the UI can update without a blocking
  refetch;
- writes use a stable idempotency key when repeating an interaction could create duplicates.

Use \`usePodFunction\` for idempotent reads. It caches identical calls, deduplicates in-flight calls,
and keeps previous data while revalidating. Pass \`null\` instead of a function name to disable it.

\`\`\`tsx
import { usePodFunction } from "@dust/react-hooks";

const comments = usePodFunction("list-comments", { threadId });
\`\`\`

Use \`usePodFunctionMutation\` for writes and other side effects. It runs only when \`trigger\` is
called, is not deduplicated, and does not infer which query caches it affects:

\`\`\`tsx
import { usePodFunction, usePodFunctionMutation } from "@dust/react-hooks";

const comments = usePodFunction("list-comments", { threadId });
const postComment = usePodFunctionMutation("post-comment");

async function handleAddComment(body: string) {
  const updatedComments = await postComment.trigger({ threadId, body });
  await comments.mutate(updatedComments, { revalidate: false });
}
\`\`\`

Trigger mutations from a button or another supported interaction, not HTML form submission. Render
loading, empty, and error states for every call. Function failures are
\`SandboxFunctionCallError\` instances with \`message\`, optional HTTP \`status\`, and an open-string
\`code\`; handle known codes and provide a generic fallback.

## Publish a Frame

Before publishing a Frames v2 manifest, validate the current source snapshot:

\`\`\`bash
dsbx frame validate /files/<scope>/<frame-folder>/manifest.json
\`\`\`

This runs the manifest, UI, function-build, database-contract, and Tailwind checks without storing or
activating a publication or reconciling Frame-owned databases. Fix every error and Tailwind warning
before publishing. Use this command instead of \`bun build\` or an ad hoc regex scan: those do not use
the Frame build context and report unrelated or noisy failures.

There is no separate v2 function publish. Once validation is clean, publish the manifest once; the
UI source, all declared functions, and all declared database schemas are built or reconciled,
stored, and activated atomically:

\`\`\`bash
dsbx frame publish /files/<scope>/<frame-folder>/manifest.json
\`\`\`

The publish output includes \`egressDomains\` when the manifest declares domains: which were
requested (pending admin approval) and which were already allowed, or why filing them failed.
Tell the user about pending requests; the functions cannot reach those domains until an admin
approves them.

After a successful publish, call \`conversation_side_panel.open_frame\` exactly once with \`path\`
set to the same canonical \`/files/...\` manifest path. This opens the Frame for the user and adds
the Frame card to the answer. Do not parse the Frame ID from the CLI output for this step.

If validation, a function build, or database reconciliation fails, no partial publication becomes
active. Fix the reported error and rerun the command.

Call a function from the active publication by its stable Frame ID and bare manifest name:

\`\`\`bash
dsbx frame call <frame-id> <function-name> --input '<json>'
\`\`\`

During authoring, the mounted Frame folder or manifest path is also accepted in place of the ID.
The ID form requires Frame use rights; the path form additionally requires read access to the
mounted source. Use this to exercise published server behavior directly; it does not test the Frame
UI.

For a legacy Frame, pass its entry source file instead:

\`\`\`bash
dsbx frame publish /files/<scope>/<frame>.tsx
\`\`\`

Do not use the \`publish_interactive_content_file\` tool: the CLI replaces it under Frames v2.
Other interactive-content tools remain available for Frame operations that the CLI does not cover
yet. Use \`dsbx frame --help\` as the authority for available operations.

Do not use \`mv\` or \`cp\` on a registered Frame folder: move and clone are not supported in this
initial scope.

## Editing

Use the Computer to edit Frame source. Never run concurrent file mutations against the same path:
read the current file, apply one edit, then start the next edit to that file.

When fixing a validation or runtime problem, preserve working structure and make the smallest
targeted edit. Do not replace an entire UI or function for a localized state, schema, or styling bug.

${INTERACTIVE_CONTENT_AUTHORING_PROSE_V2}`;
