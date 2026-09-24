import { MAX_FRAME_DATABASE_COUNT } from "@app/types/api/frame_manifest";

/**
 * @cc [owner:flvndvd,label:product] frame-document-selection
 * Document guidance MUST select narrative deliverables by their primary purpose, not editability
 * or page count. Existing formats MUST be preserved unless the user requests a format change.
 */
/**
 * @cc [owner:flvndvd;Nils-Fedrigo,label:product] slideshow-authoring-layout
 * Slideshow guidance MUST leave `Slideshow` and `Slide` in control of their dimensions.
 * Scrolling-page layout guidance MUST be scoped to pages and dashboards.
 */
export const buildFramesV2Instructions = ({
  hasDocuments,
}: {
  hasDocuments: boolean;
}) => `\
# Frames v2

A Frame is a React app with optional server functions and SQLite databases. Its source is a folder
anchored by \`manifest.json\`. Edit the source with the Computer and manage the Frame with
\`dsbx frame\`; \`dsbx frame --help\` is the authority on commands.

A legacy (v1) Frame is a single \`.tsx\` entry file. Edit it in place and publish it with
\`dsbx frame publish /files/<scope>/<frame>.tsx\`, unless the change needs server functions or a
database: then migrate it first (see "Migrating a legacy Frame").

## Choose the shape first

${
  hasDocuments
    ? `Pick the format by the deliverable's main purpose. Use \`Document\` for narrative deliverables
such as one-pagers, briefs, memos and written reports, where the text carries the explanation;
supporting charts can sit inside it. Use a regular Frame UI for dashboards and apps built around
exploring data or managing records. Editable fields or a one-page layout do not make an app a
document. Follow explicit format requests, and keep an existing Frame's format unless the user asks
to change it.

`
    : ""
}Anything users can change is durable: task lists, trackers, forms, chat apps, CRUD apps. Declare a
database plus read and mutation functions for it. Keep only throwaway UI state, such as the selected
tab, filter or sort order, in React.${hasDocuments ? " A `Document` saves its own text and comments; durable records inside its custom visuals still need a database." : ""}

Add a server function only when the browser sandbox cannot do the job: calling a Dust tool, using a
workspace secret, enforcing trusted authorization or running browser-incompatible code.

Store files such as uploads and generated artifacts in the Frame's files folder. A database row may
hold a path to a file, never its bytes, base64 included: they count against the database's 1 GiB cap,
and every read of that table then carries the payload even when the caller only wanted metadata.
Add a table about files only when the Frame must query them by something a path does not carry,
such as owner, upload date or label.

## Create and publish

Each Computer command takes several seconds, so write the source, lint and publish in one command.
There is no scaffold step; the first publish assigns the Frame's stable ID.

\`\`\`bash
FRAME=/files/conversation-<conversationId>/<frame-folder>
mkdir -p "$FRAME" &&
cat > "$FRAME/manifest.json" <<'EOF'
{ "version": 1, "description": "..." }
EOF
cat > "$FRAME/index.tsx" <<'EOF'
export default function App() {
  return <main>...</main>;
}
EOF
bash "/files/conversation-<conversationId>/skills/Create Frames/lint.sh" "$FRAME" &&
dsbx frame publish "$FRAME/manifest.json"
\`\`\`

- In a Pod, write the folder under \`/files/pod-<podId>/\`. Always pass these canonical paths to
  \`dsbx frame\`, never the \`/files/conversation\` or \`/files/pod\` aliases. The linter lives in the
  conversation's skill folder even for a Pod Frame.
- The folder name is the name users see. To rename a Frame, move its folder with the \`files\`
  server's \`move\` tool; the Frame keeps its ID, publication and share link. Never \`mv\` or \`cp\` a
  Frame folder in the Computer: that bypasses the Frame's registration. Cloning a Frame and moving
  a folder that contains Frames are not supported.
- The linter reports type errors, Tailwind arbitrary values, absolute paths to files inside the
  Frame, and function names missing from the manifest. It exits nonzero on failure. Use it rather
  than \`bun build\` or ad hoc scans, which lack the Frame build context.
- Publishing builds the UI and every function, reconciles database schemas and checks Tailwind
  again. It is atomic: if any step fails, nothing is activated. Republishing the same path updates
  the Frame in place. Viewers see no source change until you republish.
- After a successful publish, call \`conversation_side_panel.open_frame\` once, with \`path\` set to
  the manifest path. It shows the Frame and adds its card to your answer. Do not parse the Frame ID
  from the CLI output for this step.
- \`dsbx frame call <frame-id> <function> --input '<json>'\` runs a published function, for example
  to seed data. It does not exercise the UI. The Frame's folder or manifest path also works in place
  of the ID but additionally requires read access to the source.
- \`dsbx frame share-link /files/<scope>/<frame-folder>\` is read-only: it returns the Frame ID,
  share scope and existing link. The user configures sharing in the Dust UI; never change it. If
  there is no link, ask the user to create one.
- \`export_interactive_content_file\` is the only interactive-content tool under Frames v2. Use it to
  export a Frame as PNG or PDF.

When editing, read the current file first and apply one edit at a time to each path; never run
concurrent mutations on the same file. Lint and publish in the same command. Fix a validation or
runtime problem with the smallest targeted edit; do not rewrite a UI or function to fix a local bug.

### Migrating a legacy Frame

Migrate only when the change needs server functions or a database, which legacy Frames cannot
declare. Publishing with \`--replaces\` converts the Frame in place: it keeps its ID, share link and
recipients, conversation cards and, in a Pod, its pin and tab.

1. Read the legacy entry and every local file it imports, recursively.
2. Create the v2 folder next to the entry, named after it: \`dashboards/Sales.tsx\` becomes
   \`dashboards/Sales/\`.
3. Write the entry as \`index.tsx\`, with its component named \`App\`. Copy each local import to the
   same relative path in the folder; never move it, since other legacy Frames may share it, such as
   a folder-wide \`theme.ts\`. Rewrite imports that climb above the entry's folder. Leave \`useFile\`
   calls on file IDs and outside scoped paths unchanged.
4. Write \`manifest.json\`, apply the requested change and lint. Do not restyle the Frame.
5. Publish, naming the entry it replaces:

   \`\`\`bash
   dsbx frame publish /files/<scope>/dashboards/Sales/manifest.json \\
     --replaces /files/<scope>/dashboards/Sales.tsx
   \`\`\`

   A failed publish leaves the legacy Frame untouched; fix the error and retry with the same
   \`--replaces\`. If publish reports that a separate Frame already exists at the manifest path,
   stop and never publish without \`--replaces\`. Ask the user whether to delete that Frame in the
   Dust UI and retry, or keep both.
6. Success deletes the legacy entry. Delete a legacy local import only after \`grep\` shows that no
   other legacy \`.tsx\` file in the folder imports it.
7. Open the Frame with \`open_frame\` on its manifest path.

If the replacement cannot publish without rewriting the Frame, abandon the migration: delete the
new folder, apply the change to the legacy entry and publish it in place. Tell the user the Frame
stayed a legacy Frame and why.

## Folder and manifest

\`\`\`
MyFrame/
  manifest.json
  index.tsx
  theme.ts
  functions/
    list-comments.ts
    post-comment.ts
    lib/comments.ts
  databases/
    comments.db.ts
\`\`\`

\`\`\`json
{
  "version": 1,
  "description": "Read and add comments.",
  "uiEntryPoint": "index.tsx",
  "databases": [{ "name": "comments", "schema": "databases/comments.db.ts" }],
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

- The manifest has no name field. \`uiEntryPoint\` defaults to \`index.tsx\`. All paths are relative to
  the Frame folder.
- Function names are lower-case kebab-case. Database names start with a lower-case letter and
  contain only lower-case letters, digits and underscores. A Frame can declare up to
  ${MAX_FRAME_DATABASE_COUNT} databases.
- \`executionMode\` defaults to \`durable\`. \`defaultStake\` defaults to \`low\`: \`never_ask\` runs
  unattended, \`low\` asks once and can be always approved, and \`high\` asks on every call when the
  function is exposed as a tool.
- Input, output and identity schemas belong in the function's \`schema\` export, not the manifest.
- Keep server code in \`functions/\` and schemas in \`databases/\`; the UI linter skips both.
- For a substantial Frame, keep a \`direction.md\` recording the audience, visual premise,
  typography, color logic and anything later edits must preserve.

## Functions

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

- The default export must be an object with \`fetch\`; a bare function is invalid. The request body
  is validated against \`schema.input\` before \`fetch\` runs.
- Only \`zod\`, \`drizzle-orm\` and \`@dust/pod\` are guaranteed at build time. Put helpers and shared
  Zod schemas in \`functions/lib/\` and import them with relative paths.
- \`fast\` functions return sooner but have a ten-second ceiling and cannot call Dust tools. Use
  \`durable\` (two-minute ceiling) for any function that calls \`tools.call\`. Durable calls run in
  the background and may wait for user approval or authentication, so their UI needs a loading
  state. For polled tool data that may be slightly stale, have a durable function refresh a
  database and a fast function serve it.
- Outbound HTTP follows the workspace egress allowlist and the same \`DST_*\` and \`DSEC_*\`
  configuration as the Computer.

### Calling Dust tools

In the Computer, use \`dsbx tools --help\` to find the server, tool and argument names. In function
source, call the tool with \`tools.call\`; never shell out to \`dsbx\`. Pass the server exactly as
\`dsbx tools\` lists it: a workspace can hold several instances of one server under their own names,
such as \`gmail1\` and \`gmail2\`, and a line that shows an \`id:\` must be called by that id.

\`\`\`ts
import { tools } from "@dust/pod";

const result = await tools.call("gmail", "get_messages", { maxResults: 10 });
if (result.isError) {
  throw new Error(result.text() || "Tool call failed.");
}
const messages = result.json(); // or result.text() for unstructured output
\`\`\`

Arguments are a plain JSON object. Transport failures throw; a tool that ran and failed resolves
with \`isError: true\`. The runtime refuses tool calls from \`fast\` functions.

### Caller identity

\`schema.userIdentity\` decides who may call the function:

- \`optional\` (default) allows calls without a user.
- \`workspace_user_required\` requires a current member of the owning workspace.
- \`interactive_workspace_user_required\` also requires a live Dust session, so it refuses agents,
  schedules and API clients.
- \`frame_author_required\` requires the right to modify the Frame's source: conversation access, or
  write access in a Pod. Use it for every author-only operation.

UI calls always require an authenticated member of the owning workspace; other viewers get a typed
authorization error. \`currentUser()\` from \`@dust/pod\` returns
\`{ sId, firstName, lastName, fullName, image, isPodMember, isPodEditor }\`, or \`null\` without a
user. Never accept a user ID as input; the caller can forge it.

## Databases

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
import { desc, eq } from "drizzle-orm";
import { comments } from "../databases/comments.db.ts";

// Name the table first, then finish with .get(), .all() or .run().
const inserted = db("comments").insert(comments)
  .values({ threadId, authorId, body, createdAt: new Date() }).returning().get();
const thread = db("comments").select().from(comments)
  .where(eq(comments.threadId, threadId)).orderBy(desc(comments.createdAt)).all();
\`\`\`

- Publishing reconciles the declared schemas and keeps existing data. Functions reach a database
  only through \`db(name)\`, never through the source folder.
- Always import the table objects from the schema file: they also define row serialization. Do not
  redefine tables, hand-write SQL migrations or keep state in module globals.
- Schemas evolve additively only; never drop, rename or retype anything. Give every table \`id\` and
  \`createdAt\`, and mark required fields in new tables \`.notNull()\`. A column added to an existing
  table must be nullable or have a default. Avoid foreign keys and CHECK or UNIQUE constraints;
  use \`uniqueIndex()\` only when existing rows already satisfy it.
- For per-user data, store \`currentUser().sId\` in an indexed column and filter on it in every read
  and write. Fetching a row by primary key does not prove ownership.
- Each database is capped at 1 GiB.

## Files folder

\`persistentFilesDir()\` from \`@dust/pod\` returns the Frame's persistent folder; use it with
\`node:fs\`. It is remote object storage, not local disk, and you cannot read it while authoring.

- Nothing caches reads or writes, so anything beyond a tiny file needs a \`durable\` function.
- A function result is capped at 5 MB, which bounds both uploads and returned files. Store a file in
  one call, return an identifier and fetch it in another; never write and read back in one call.
- Viewer input can contain \`..\`. A write that resolves above the folder succeeds onto disk the
  Frame loses when its sandbox recycles. Check that each resolved path stays under the folder, and
  derive per-user paths from \`currentUser().sId\`.
- Nothing validates what is written, so a name says nothing about the bytes behind it. Stick to
  \`.png\`, \`.jpeg\`, \`.json\`, \`.txt\` and \`.csv\`. When returning a stored file, pick its content type from a
  fixed list in code, never from the file name. Never serve \`image/svg+xml\` or \`text/html\`, which
  run script inside the Frame.

## UI

### Runtime

- Frames render in a resizable iframe. The side panel defaults to two-thirds of the browser width,
  and inline previews are capped at 600px tall: put the title, main visual and first controls in
  that space. Check the result at the default width and in fullscreen.
- The entry file default-exports a component named \`App\` that takes no props.
  \`React.createElement\` is not supported.
- Only these imports are available: \`react\`, \`recharts\`, \`lucide-react\`, \`papaparse\`, \`shadcn\`,
  \`@viz/lib/utils\`, \`@dust/frame\`, \`@dust/react-hooks\`, \`@dust/slideshow/v2\`,
  ${hasDocuments ? "`@dust/document/v1`, " : ""}\`motion/react\`, relative source files, and
  \`@dust/slideshow/v1\` when editing an existing v1 slideshow.
- The browser can reach only Dust; \`fetch\`, XHR and WebSocket to other hosts are blocked. External
  \`<img src>\` works. Links need \`target="_blank"\`.
- The sandbox silently blocks \`<form>\` submission and \`<a download>\`. Use buttons with \`onClick\`.
  For downloads and screenshots, call \`triggerUserFileDownload\` or \`captureScreenshot\` from
  \`@dust/react-hooks\` in response to a user action.
- Do not listen for keys on \`window\`, which hijacks the host page. Scope \`onKeyDown\` to a
  focusable element.
- Tailwind is precompiled, so arbitrary values such as \`h-[600px]\` fail lint and publish. Use
  predefined utilities or the \`style\` prop.

### Calling functions

Use \`useFrameFunction\` for reads and \`useFrameFunctionMutation\` for writes, both from
\`@dust/react-hooks\`, with the bare manifest name. Pass \`null\` as the name to disable a read.
Returned data is typed \`unknown\` because the UI cannot see the Zod schema, so cast it before
reading fields.

\`\`\`tsx
import { useFrameFunction, useFrameFunctionMutation } from "@dust/react-hooks";

type CommentList = { comments: { id: number; body: string }[] };

const comments = useFrameFunction("list-comments", { threadId });
const postComment = useFrameFunctionMutation("post-comment");
const items = (comments.data as CommentList | undefined)?.comments ?? [];

async function addComment(body: string) {
  if (postComment.isMutating) {
    return;
  }
  const updated = (await postComment.trigger({ threadId, body })) as CommentList;
  await comments.mutate(updated, { revalidate: false });
}
\`\`\`

- Reads are cached and deduplicated. Design each one to return a bounded snapshot of a screen
  rather than causing request waterfalls.
- Mutations are not deduplicated and do not invalidate reads. While one is in flight, \`isMutating\`
  is true (\`isLoading\` is an alias of the same flag). Return the updated entity or screen
  so the UI can \`mutate\` without refetching, and use an idempotency key where a repeated
  interaction could create duplicates.
- Render loading, empty and error states for every call. Failures are \`SandboxFunctionCallError\`
  instances with \`message\`, an optional HTTP \`status\` and a string \`code\`; handle known codes
  and add a generic fallback.

### Theme and art direction

You own the visual direction. Derive it from the audience, subject, brand assets and any references
the user provides; there is no preset catalog or font list.

Copy \`skills/Create Frames/theme.ts\` into the Frame folder, edit its values, and pass \`theme\` to
the root: \`FrameRoot\` from \`@dust/frame\` for pages and dashboards, or \`Slideshow\` for decks. The
root scopes the theme's CSS variables to its contents. Without \`theme\`, the Frame follows the
host's light or dark mode.

- The semantic variables are \`--background\`, \`--foreground\`, \`--primary\`,
  \`--primary-foreground\`, \`--card\`, \`--card-foreground\`, \`--muted\`, \`--muted-foreground\`,
  \`--border\`, \`--radius\`, and \`--font-sans\`, \`--font-serif\` and \`--font-mono\`. Fonts must be
  available in the browser or loaded by the Frame.
- \`--primary\` is the accent and defaults to near-black, which also colors shadcn default buttons,
  so always set it. Use the accent on headings, primary actions, key metrics and selected states.
  One accent family plus neutrals is usually enough; literal Tailwind colors suit secondary
  accents. A colorless Frame is wrong.
- Use \`bg-background\` and \`bg-card\` for surfaces instead of hardcoded \`bg-white\`.
  \`bg-background\`, \`bg-card\`, \`bg-secondary\`, \`text-foreground\` and \`text-muted-foreground\`
  are structural neutrals, not a palette by themselves.
- Setting a variable does not create Tailwind classes. Custom \`--*\` variables must be consumed
  through CSS or \`style\`. A misspelled semantic name silently becomes a custom variable, so check
  the render. Keep \`satisfies FrameTheme\` in the theme file.
- A nested \`FrameRoot\` with a partial theme overrides one section. Components rendered in a portal
  outside the root do not inherit its variables.
- Use shadcn/ui as a baseline and lucide-react icons rather than emoji. Put charts and KPIs in
  Cards, but not controls, navigation or plain text, and do not nest Cards. Prefer a bespoke visual
  when it explains the material better than a generic card.
- For shadcn Buttons, use semantic variants (\`default\`, \`secondary\`, \`outline\`,
  \`destructive\`) and let shadcn handle hover states unless a selected state needs the accent.

### Pages and dashboards

These rules apply only to pages and dashboards; slideshows manage their own size.

\`\`\`tsx
import { FrameRoot } from "@dust/frame";
import { theme } from "./theme";

export default function App() {
  return (
    <FrameRoot theme={theme} className="min-h-screen">
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <h1 className="text-3xl font-semibold text-primary">{title}</h1>
        {content}
      </main>
    </FrameRoot>
  );
}
\`\`\`

- Use one centered, naturally scrolling column (\`max-w-3xl\` or \`max-w-5xl\`).
- The iframe width is not the viewport, so breakpoint classes such as \`md:grid-cols-2\` misfire. For
  responsive columns, set \`gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))"\` through
  \`style\`.
- If you fix the height with \`h-screen\`, \`100vh\` or \`h-full\` plus \`overflow-hidden\`, give the main
  region \`overflow-y-auto\`.
- Avoid horizontal scrolling; stack or simplify instead. Show screenshots and mockups with
  \`object-contain\`. Keep \`text-4xl\` and larger for full-width heroes.

### Slideshows

Build a slideshow only when the user asks for slides, a deck or a presentation. Read the attached
\`slideshow.example.tsx\` first.

- Import \`Slideshow\` and \`Slide\` from \`@dust/slideshow/v2\`, and return \`<Slideshow theme={theme}>\`
  directly from \`App\`. It provides navigation, previews, keyboard shortcuts, fullscreen and PDF
  rendering; use these built-in controls rather than your own.
- \`Slideshow\` and \`Slide\` own their size, aspect ratio and scaling. Style them with \`className\`,
  such as a background, and put headers, footers and padding inside \`Slide\`.
- Give each slide one idea. If content does not fit, simplify it or split it across slides rather
  than resizing the slide. Prefer charts to tables for data.
- Keep one background across slides, such as \`bg-background\`, with one or two accent colors. Order
  each slide's content as title, then visuals or key points, then supporting text.
${
  hasDocuments
    ? `
### Documents

\`Document\` from \`@dust/document/v1\` provides rich text editing, autosaves to a JSON file in the
Frame folder, and places your React components in the text through named visual blocks. Read the
attached \`document.md\` before creating or editing one. For a new document, also read
\`document.example.tsx\` and \`document.example.json\`.
`
    : ""
}
### Charts

- Use shadcn's \`ChartContainer\`, \`ChartConfig\`, \`ChartTooltip\` and \`ChartTooltipContent\`. Give
  \`ChartContainer\` or \`ResponsiveContainer\` an explicit height, such as \`className="h-72 w-full"\`
  or \`width="100%"\` with a numeric \`height\`; they collapse otherwise. Do not rely on a chart
  wrapper's default width.
- Color series through \`chartConfig\`, as in \`{ revenue: { label: "Revenue", color: "var(--chart-1)" } }\`,
  and reference \`var(--color-revenue)\`. Use \`<Cell>\` for per-bar colors, not raw \`<rect>\`.
  Chart variables color the series only; the Frame's brand identity still needs its accent.
- Leave margins for axes and labels at narrow widths, for example
  \`{ top: 20, right: 30, left: 20, bottom: 20 }\`. Keep legends in the layout flow, not
  \`position: absolute\`.
- A tooltip \`formatter\` returns \`[value, name]\`; a \`labelFormatter\` returns a string.
- \`motion/react\` is available for entrances, staggered reveals and mount/unmount effects through
  \`AnimatePresence\`. Prefer one orchestrated entrance over scattered micro-interactions. Keep
  entrances at 0.3–0.5 s and interaction feedback at 0.15–0.25 s.

### Data

- Read structured files, such as attachments, tool outputs and Pod files, with \`useFile\` instead of
  copying their contents into source. Inline only small data already in the conversation, and never
  build a file from it.
- Pass \`useFile\` a \`./\` path for files inside the Frame folder. For files outside it, pass a file ID
  (\`fil_...\`) or a scoped path such as \`conversation-<conversationId>/report.csv\` or
  \`pod-<podId>/notes.md\`. Bare \`conversation/...\` or \`pod/...\` paths can load the wrong file.
  Import source and theme files with relative imports, not \`useFile\`.
- \`file.text()\` is async, so parse inside \`useEffect\` and catch errors. Parse CSV with
  \`papaparse\` and \`skipEmptyLines: "greedy"\`. Render images through \`URL.createObjectURL(file)\`.
- Name the prop \`fileId\` on components that take a file so the server can prefetch it, and keep
  file IDs as whole string literals. Another Frame can be imported as a component by file ID or
  scoped path, as in \`import SalesChart from "fil_abc123"\`.
- Every async source needs loading, empty and error states. Keep the Frame visible while loading
  instead of returning early.
- Render declared data such as \`ROWS\` rather than stale hardcoded JSX, and replace every old
  literal when adapting a template.
- Copy names, counts, IDs, dates and quoted strings exactly from the source, including tool outputs.
  Never invent missing values; omit them or show "No data available". Follow instructions such as
  "remove", "group" or "do not split" literally, and add no disclaimers or commentary about the
  data.

### Viewer identity

\`useUserIdentity()\` from \`@dust/react-hooks\` returns
\`{ isAuthenticated, isWorkspaceMember, isFrameAuthor, isPodMember, isPodEditor, user, isLoading, error }\`.

- \`isAuthenticated\` is true only for a signed-in member of the owning workspace. Treat \`error\` as
  unauthenticated. A Frame cannot sign anyone in, so show an "unavailable" view, not a login prompt.
- \`isPodMember\` and \`isPodEditor\` are false outside a Pod, even for actual members. Read false as
  "hide Pod-only features", not as proof that the viewer is not a member.
- Viewers can inspect everything the Frame renders. Use \`isFrameAuthor\` to show author-only
  controls, and enforce them with \`frame_author_required\` functions.

### Interactions

- Anything that looks clickable must visibly do something; no inert buttons or \`console.log\`
  handlers. Selected tabs, chips and toggles need a visible selected style.
- Check nullable numbers explicitly (\`value !== null\`); \`if (value)\` drops a valid \`0\`.
`;
