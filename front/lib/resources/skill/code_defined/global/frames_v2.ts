import { INTERACTIVE_CONTENT_AUTHORING_PROSE_V2 } from "@app/lib/api/actions/servers/interactive_content/instructions_v2";
import { MAX_FRAME_DATABASE_COUNT } from "@app/types/api/frame_manifest";

export const FRAMES_V2_INSTRUCTIONS = `\
# Frames v2

Frames are interactive React applications. Use the Computer to create and edit their source, and
the \`dsbx frame\` CLI for their lifecycle.

## Frames v2 vs legacy Frames

- A Frames v2 source is a package-like folder anchored by \`manifest.json\`. The published
  manifest is the canonical Frame resource; its folder contains the UI source, assets, and
  function source. The manifest declares one UI entry point (\`index.tsx\` by default) and every
  server function. Publishing snapshots the whole folder, builds every declared function, and
  atomically activates the publication. The first publish also assigns the Frame's stable identity.
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

Every Computer command is a round trip of several seconds. When possible, write the real source
and publish a new Frame in one Computer command. There is no scaffold step: create the folder,
write \`manifest.json\` and \`index.tsx\` (plus any functions or databases), lint, then publish.
The first \`dsbx frame publish\` mints the Frame's stable identity from the manifest path and
activates the publication.

\`\`\`bash
FRAME=/files/conversation-<conversationId>/<frame-folder>
mkdir -p "$FRAME" &&
cat > "$FRAME/manifest.json" <<'EOF'
{
  "version": 1,
  "description": "..."
}
EOF
cat > "$FRAME/index.tsx" <<'EOF'
export default function App() {
  return <main>...</main>;
}
EOF
bash "/files/conversation-<conversationId>/skills/Create Frames/lint.sh" "$FRAME" &&
dsbx frame publish "$FRAME/manifest.json"
\`\`\`

In a Pod, write it under \`/files/pod-<podId>/...\` instead. The folder name is the Frame's name.
Only use separate Computer commands when a step needs the previous one's output.

Always pass canonical \`/files/conversation-<conversationId>/...\` or
\`/files/pod-<podId>/...\` paths to \`dsbx frame\`. Do not pass the convenience aliases
\`/files/conversation\` or \`/files/pod\`.

## Art direction and shared theme

You own the Frame's visual direction. Derive it from the audience, subject, supplied brand assets
and approved references. Choose the typography, color, density and bespoke visuals that communicate
the material. There is no preset catalog or fixed font list.

Copy the attached \`skills/Create Frames/theme.ts\` into the Frame folder as \`theme.ts\`, then edit
its values for this Frame. Pass \`theme\` to the content's root: \`FrameRoot\` from \`@dust/frame\` for
pages and dashboards, or \`Slideshow\` from \`@dust/slideshow/v2\` for presentations. Both use the same
theme file and scope the existing Tailwind variables to their contents. Author ordinary React and SVG
using the existing classes. Omit \`theme\` to keep the host's light or dark appearance.
Name the entry component \`App\` and import the root component rather than declaring it locally.

For a page or dashboard:

\`\`\`tsx
import { FrameRoot } from "@dust/frame";
import { theme } from "./theme";

export default function App() {
  return (
    <FrameRoot theme={theme} className="space-y-6 p-8">
      <h1 className="font-serif text-4xl font-semibold">...</h1>
      <svg
        className="h-12 w-full"
        viewBox="0 0 120 24"
        role="img"
        aria-label="Illustrative chart"
      >
        <rect width="96" height="24" className="fill-primary" />
      </svg>
    </FrameRoot>
  );
}
\`\`\`

Use the existing semantic variables: \`--background\` and \`--foreground\`, \`--primary\` and
\`--primary-foreground\`, \`--card\` and \`--card-foreground\`, \`--muted\` and \`--muted-foreground\`,
\`--border\` and \`--radius\`. Set \`--font-sans\`, \`--font-serif\` or \`--font-mono\` for the corresponding
font classes. Values are ordinary CSS strings. Fonts must be available in the browser or loaded by
the Frame. Keep related foreground and background colors legible together.

Keep shared values in \`theme.ts\` so custom visuals and components using those semantic classes
follow the same direction. Extend the theme with normal object spreads. A nested FrameRoot inherits
omitted variables and can override a section:

\`\`\`tsx
<FrameRoot
  theme={{ "--primary": "rebeccapurple" }}
  className="rounded-lg bg-card p-4 text-card-foreground"
>
  ...
</FrameRoot>
\`\`\`

The theme does not choose heading sizes or add page padding. Use existing utilities for layout,
spacing and typography. Setting a variable does not generate new Tailwind classes. Custom \`--*\`
variables are also allowed, but your code must consume them explicitly through CSS or \`style\`.
Components rendered in a portal outside the themed root do not inherit its scoped variables.

Use relative imports for source and theme files, not \`useFile\`. The attached linter checks missing
imports and type errors. Keep \`satisfies FrameTheme\` in the theme file to catch keys without a
\`--\` prefix and values that are not strings or numbers. A misspelled semantic variable is still
a valid custom variable, so inspect the rendered result to verify it takes effect.

For a substantial Frame, keep \`direction.md\` beside the source. Record audience, purpose, visual
premise, typography hierarchy, density, color logic, reference material and what later edits must
preserve. Create bespoke visuals when they explain the material better than generic cards. Small
Frames do not need empty files or wrappers merely to match a folder layout.

## Retrieve a Frame's share link

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
  "description": "Read and add comments.",
  "uiEntryPoint": "index.tsx",
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

- A Frame is named by its folder, and \`manifest.json\` carries no name. Choose the folder name
  carefully at creation: it is the name users see. To rename a Frame, move its folder — the Frame
  keeps its ID, its active publication and its share link, so there is nothing to republish. The
  user can rename it the same way from the Pod UI, so refer to a Frame by its stable ID whenever
  you need an identifier that survives a rename.
- \`uiEntryPoint\` defaults to \`index.tsx\` when omitted.
- Function names are lower-case alphanumeric segments separated by single hyphens.
- \`entryPoint\` paths are relative to the Frame folder. Keep shared helpers under that folder and
  import them with relative paths.
- Each database declaration names Frame-owned SQLite state and points to its Drizzle schema file.
  Database names start with a lower-case letter and contain only lower-case letters, digits, and
  underscores. A Frame can declare up to ${MAX_FRAME_DATABASE_COUNT} databases.
- \`executionMode\` defaults to \`durable\`. Use \`fast\` when the function never calls a Dust tool;
  use \`durable\` when it calls \`tools.call\` (or otherwise invokes a Dust tool).
- \`defaultStake\` defaults to \`low\`. \`never_ask\` runs unattended, \`low\` asks once and can be
  always approved, and \`high\` asks on every call when the function is exposed as a tool.
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

Use the Frame's persistent files folder for unstructured data: uploaded images, generated
documents, Markdown notes, anything that is a file rather than a row. Never store file bytes in a
database column, base64 included. They count against the database's 1 GiB cap, and every read of
that table then carries the payload even when the caller only wanted the metadata. Most Frames
need nothing but the folder to hold their files. A Frame database holds rows, files or no files;
add a table about files only when the Frame must query them by something a path does not carry —
owner, upload date, a label — and store the path in it, never the contents.

## Authoring a function

When adding a function, write its source file and add its name, description and entryPoint to
\`manifest.functions\` before running the linter. Use that same name in the UI hook. The linter
reads the local manifest, so the function does not need to be published yet.

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
reconciles the declared schemas but does not replace existing data. The runtime never mounts the
Frame source: functions reach structured state only through the declared database handles, and
bytes only through the files folder below.

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
- change a shape by adding a new column or table and reading with a fallback;
- store a path into the Frame's files folder for an image or a document, never the bytes
  themselves: a column holding base64 makes the table unreadable without its payload.

For per-user state, require a caller, store \`currentUser().sId\`, index that column, and filter by it
on every read and write. Fetching a row by primary key does not prove ownership.

### Fast and durable functions

- \`fast\` runs synchronously and returns sooner, but cannot call Dust tools. Frame databases, local
  computation, local binaries, and allowed outbound HTTP still work, but count against its shorter
  execution ceiling.
- \`durable\` is required for Dust tool calls (\`tools.call\`). Tool calls can wait for user approval
  or personal authentication, so the invocation runs in the background and resumes when the user
  responds.

The decision is mechanical: if a function calls \`tools.call\`, declare it \`durable\`; otherwise
prefer \`fast\`. A durable call is visibly slower, so its UI needs a loading state.

When polled UI data comes from a Dust tool and can be slightly stale, split the path: a durable
function refreshes the Frame database and a fast function serves the stored snapshot. Keep the
whole path durable only when every call must be live or the interaction itself is the tool action.

### Calling Dust tools from a function

**Computer vs Frame function — do not mix the two call styles:**

- From the **Computer** (your bash session): explore and invoke tools with the \`dsbx tools\` CLI
  (\`dsbx tools --help\`, \`dsbx tools --json …\`). That is the Computer skill's path.
- Inside **Frame function source** (\`fetch()\`): use \`tools.call\` from \`@dust/pod\`. Do **not**
  shell out to \`dsbx\`, \`execFile\`, or \`child_process\` to run \`dsbx tools\` from a function.

Discover the exact server name, tool name, and argument shapes from the Computer with
\`dsbx tools --help\` (and trial calls with \`--json\` if needed). Then implement the durable
function with the typed client:

\`\`\`ts
import { tools } from "@dust/pod";

export default {
  async fetch(request: Request): Promise<Response> {
    const { maxResults } = await request.json();
    const result = await tools.call("gmail", "get_messages", {
      maxResults,
      includeAttachments: false,
    });
    if (result.isError) {
      throw new Error(result.text() || "Tool call failed.");
    }
    // Prefer result.json() when the tool returns structured output; otherwise parse result.text().
    return Response.json({ /* … */ });
  },
};
\`\`\`

\`tools.call(server, tool, args?)\` takes a plain JSON \`args\` object (no stringification, no CLI
flags). Transport failures throw; a tool that ran and reported an error resolves with
\`isError: true\`. Publishing a function that calls Dust tools as \`fast\` is a bug: the runtime
refuses the tool call. Function \`fetch()\` requests use the same workspace egress allowlist and
\`DST_*\` / \`DSEC_*\` configuration rules as the Computer.

### Knowing who called a function

The \`schema.userIdentity\` policy decides whether the function may run:

- \`optional\` is the default and allows calls without a user.
- \`workspace_user_required\` requires a current member of the owning workspace.
- \`interactive_workspace_user_required\` additionally requires the member's live Dust session;
  delegated agents, schedules, and API clients are refused.
- \`frame_author_required\` requires the caller to be able to modify the Frame v2 source files. In a
  standalone conversation this follows conversation access; in a Pod it follows write access to the
  Pod. Use this for author-only or admin functions.

Frame UI calls are available only to authenticated members of the owning workspace; guest or link
viewers must get a typed authorization error. A function policy can impose a stricter requirement.

Use \`currentUser()\` from \`@dust/pod\` for the trusted caller. It returns
\`{ sId, firstName, lastName, fullName, image, isPodMember, isPodEditor }\`, or \`null\` under the
optional policy when there is no user. Never accept a caller \`userId\` as function input: the caller
can forge it. The frontend's \`useUserIdentity\` hook also returns \`isFrameAuthor\`; use that flag to
show author-only UI, but enforce every author-only operation with \`frame_author_required\` because
client-side conditions are not access control.

## Storing files in a Frame

A Frame owns one persistent folder in its sandbox, kept for the lifetime of the Frame.
\`persistentFilesDir()\` from \`@dust/pod\` returns its absolute path; use it with \`node:fs\` like
any other directory, for whatever the Frame needs to keep: uploads, generated artifacts, cached
tool results. It is not part of the Frame source, so its contents exist only at run time and you
cannot read them while authoring.

It is remote object storage, not local disk:

- Every read and write crosses the wire and nothing caches it, so a \`fast\` function's ten-second
  ceiling will not survive anything but a tiny file. Declaring the function \`durable\` raises the
  ceiling to two minutes.
- Nothing validates what gets written, so a name says nothing about the bytes behind it. Stick to
  \`.png\`, \`.jpeg\`, \`.json\`, \`.txt\`, and \`.csv\`.
- A path segment from a viewer can contain \`..\` and resolve above the folder, where the write
  succeeds onto disk the Frame loses when its sandbox recycles. Check the resolved path is still
  under \`persistentFilesDir()\`, and derive per-user paths from \`currentUser().sId\` rather than
  from input.

Moving a stored file through a function is bounded separately from the folder itself. A function
result is capped at 5 MB, which limits both the upload a function can accept and the file it can
return in one call. Never write a file and read it back in the same call: the payload crosses the
wire twice. Store it in one function, return an identifier, and let the UI fetch it from another.
When a function returns a stored file, pick the content type from a fixed list in code — never
from the name, and never \`image/svg+xml\` or \`text/html\`, which execute script inside the Frame.

## Calling a function from the Frame UI

Use the \`useFrameFunction\` and \`useFrameFunctionMutation\` hooks from
\`@dust/react-hooks\`. Refer to the Frame's own functions by their bare manifest name.

Design contracts around UI interactions rather than database tables:

- reads are idempotent and return one bounded screen snapshot instead of creating waterfalls;
- mutations return the updated entity or screen snapshot so the UI can update without a blocking
  refetch;
- writes use a stable idempotency key when repeating an interaction could create duplicates.

Use \`useFrameFunction\` for idempotent reads. It caches identical calls, deduplicates in-flight calls,
and keeps previous data while revalidating. Pass \`null\` instead of a function name to disable it.
\`data\` is typed as \`unknown\`: the UI cannot see the function's Zod \`output\` schema. Narrow or cast
it to the shape you declared in \`schema.output\` before reading fields — never access
\`result.data.someField\` directly or TypeScript will fail lint and publish.

\`\`\`tsx
import { useFrameFunction } from "@dust/react-hooks";

type CommentList = { comments: { id: number; body: string }[] };

const comments = useFrameFunction("list-comments", { threadId });
const payload = comments.data as CommentList | undefined;
const items = payload?.comments ?? [];
\`\`\`

Use \`useFrameFunctionMutation\` for writes and other side effects. It runs only when \`trigger\` is
called, is not deduplicated, and does not infer which query caches it affects. While a mutation is
in flight, \`isMutating\` is true (\`isLoading\` is an alias of the same flag). \`trigger\`'s return
value is also \`unknown\`: cast it the same way when you pass it into \`mutate\`.

\`\`\`tsx
import { useFrameFunction, useFrameFunctionMutation } from "@dust/react-hooks";

type CommentList = { comments: { id: number; body: string }[] };

const comments = useFrameFunction("list-comments", { threadId });
const postComment = useFrameFunctionMutation("post-comment");
const payload = comments.data as CommentList | undefined;
const items = payload?.comments ?? [];

async function handleAddComment(body: string) {
  if (postComment.isMutating) {
    return;
  }
  const updatedComments = (await postComment.trigger({
    threadId,
    body,
  })) as CommentList;
  await comments.mutate(updatedComments, { revalidate: false });
}
\`\`\`

Trigger mutations from a button or another supported interaction, not HTML form submission. Render
loading (\`isLoading\` on reads, \`isMutating\` / \`isLoading\` on mutations), empty, and error states
for every call. Function failures are
\`SandboxFunctionCallError\` instances with \`message\`, optional HTTP \`status\`, and an open-string
\`code\`; handle known codes and provide a generic fallback.

A Frame cannot make the browser download a file. Its UI runs in a sandboxed iframe that does not
allow downloads, so building an anchor with a \`download\` attribute and clicking it silently does
nothing — no error to catch. Do not offer a download button. Render the contents in the UI
instead: an \`<img>\` for an image, formatted text for data, a table for rows.

## Check the Frame UI

For a v2 Frame, run the attached linter on its folder before publishing:

\`\`\`bash
bash "/files/conversation-<conversationId>/skills/Create Frames/lint.sh" "$FRAME"
\`\`\`

The skill files stay in the conversation even when the Frame lives in a Pod. The script fetches
the Viz types and reports type and lint errors with file, line and column. Fix those errors before
publishing. A failed check returns a nonzero exit code.

It keeps generated configs on local sandbox disk and leaves the Frame source and existing
configs untouched. Keep server functions in
\`functions/\` and database schemas in \`databases/\`, which are excluded from UI linting.
The linter also checks UI and backend source for absolute scoped paths to files inside the Frame.
Use the suggested \`./…\` path so those references still work when the Frame moves.

A literal function name passed to \`useFrameFunction\` or \`useFrameFunctionMutation\` must be
declared in \`manifest.functions\`. The linter also checks their legacy Pod aliases and reports
the call's file, line, column and the declared names. Fix a typo in the call or add the new
function to the manifest. Names computed at run time are not checked.

## Publish a Frame

There is no separate v2 function publish. Publish the manifest once; the UI source, all declared
functions, and all declared database schemas are built or reconciled, stored, and activated
atomically:

\`\`\`bash
dsbx frame publish /files/<scope>/<frame-folder>/manifest.json
\`\`\`

Publishing runs the manifest, UI, function-build, database-contract and Tailwind checks.
If any fails, no partial publication
becomes active: fix the reported error and rerun. Tailwind arbitrary values such as \`h-[600px]\`
are errors, not warnings: use predefined classes or the \`style\` prop. Run the attached linter
before publishing to check in-package file paths and function names. For a brand-new folder,
publish also assigns the Frame identity; republishing the same path updates that Frame in place.

Use \`dsbx frame publish\` instead of \`bun build\` or an ad hoc regex scan: those do not use the
Frame build context and report unrelated or noisy failures.

After a successful publish, call \`conversation_side_panel.open_frame\` exactly once with \`path\`
set to the same canonical \`/files/...\` manifest path. This opens the Frame for the user and adds
the Frame card to the answer. Do not parse the Frame ID from the CLI output for this step.

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

The only interactive-content MCP tool available under Frames v2 is
\`export_interactive_content_file\`: use it to export a Frame as a PNG screenshot or PDF document.
Use the Computer and CLI for all other Frame operations. Use \`dsbx frame --help\` as the authority
for available operations.

Do not use \`mv\` or \`cp\` on a Frame folder: move and clone are not supported in this
initial scope.

## Editing

Use the Computer to edit Frame source. Never run concurrent file mutations against the same path:
read the current file, apply one edit, then start the next edit to that file. Apply the edit, run
the UI linter for v2 Frames, and run \`dsbx frame publish\` in the same Computer command.

When fixing a validation or runtime problem, preserve working structure and make the smallest
targeted edit. Do not replace an entire UI or function for a localized state, schema, or styling bug.

${INTERACTIVE_CONTENT_AUTHORING_PROSE_V2}`;
