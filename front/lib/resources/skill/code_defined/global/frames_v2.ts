import { INTERACTIVE_CONTENT_AUTHORING_PROSE_V2 } from "@app/lib/api/actions/servers/interactive_content/instructions_v2";

export const FRAMES_V2_INSTRUCTIONS = `\
# Frames v2

Frames are interactive React applications. Use the Computer to edit their source and the
\`dsbx frame\` CLI to publish them.

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
\`\`\`

The manifest declares the UI entry point and every server function:

\`\`\`json
{
  "version": 1,
  "name": "Comments",
  "description": "Read and add comments.",
  "uiEntryPoint": "index.tsx",
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
- \`executionMode\` defaults to \`durable\`. Use \`fast\` when the function never calls a Dust tool;
  use \`durable\` when it calls \`dsbx tools\`.
- \`defaultStake\` defaults to \`low\`. \`never_ask\` runs unattended, \`low\` asks once and can be
  always approved, and \`high\` asks on every call when the function is exposed as a tool.
- Input, output, and caller-identity schemas belong in the function's TypeScript \`schema\` export,
  not in \`manifest.json\`. The build extracts them from source.

## When to add a server function

Use a Frame function when the UI needs server-side behavior it cannot safely or technically run in
the browser sandbox: calling a Dust tool, using a workspace secret, applying trusted authorization,
or running browser-incompatible logic. Keep presentation, filtering, sorting, and other local UI
behavior in the React component.

Frames v2 does not yet expose Frame-owned persistent databases. Do not pretend component state,
module globals, the source folder, or a Pod database is the Frame's durable state. If the requested
Frame requires durable shared state, explain that this part is not supported yet unless the user
explicitly chooses a separate external system.

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
used by several functions in \`functions/lib/\` rather than duplicating it. Publishing bundles each
entry point and its relative imports from one source snapshot. Editing any source or helper changes
nothing for viewers until the whole Frame is published again.

\`zod\` and \`@dust/pod\` are available to function source. Other npm packages are not guaranteed at
build time.

### Fast and durable functions

- \`fast\` runs synchronously and returns sooner, but cannot call Dust tools. Local computation,
  local binaries, and allowed outbound HTTP still count against its shorter execution ceiling.
- \`durable\` is required for \`dsbx tools\`. Tool calls can wait for user approval or personal
  authentication, so the invocation runs in the background and resumes when the user responds.

The decision is mechanical: if a function calls \`dsbx tools\`, declare it \`durable\`; otherwise
prefer \`fast\`. A durable call is visibly slower, so its UI needs a loading state.

### Calling Dust tools from a function

Run \`dsbx tools --help\` from the Computer first to discover the exact server, tool, and arguments.
Inside a durable function, shell out to:

\`\`\`bash
dsbx tools --json <server-name> <tool-name> <arguments...>
\`\`\`

Parse the JSON stdout envelope, including \`content\` and \`isError\`. Publishing a function that
calls \`dsbx tools\` as \`fast\` is a bug: the runtime refuses the tool call. Function \`fetch()\`
requests use the same workspace egress allowlist and \`DST_*\` / \`DSEC_*\` configuration rules as
the Computer.

### Knowing who called a function

The \`schema.userIdentity\` policy decides whether the function may run:

- \`optional\` is the default and allows calls without a user.
- \`workspace_user_required\` requires a current member of the owning workspace.
- \`interactive_workspace_user_required\` additionally requires the member's live Dust session;
  delegated agents, schedules, and API clients are refused.
- \`pod_member_required\` requires membership in the Pod when the Frame belongs to one.

Frame UI calls are available only to authenticated members of the owning workspace; guest or link
viewers must get a typed authorization error. A function policy can impose a stricter requirement.

Use \`currentUser()\` from \`@dust/pod\` for the trusted caller. It returns
\`{ sId, firstName, lastName, fullName, image, isPodMember, isPodEditor }\`, or \`null\` under the
optional policy when there is no user. Never accept a caller \`userId\` as function input: the caller
can forge it. The frontend's \`useUserIdentity\` hook is for presentation only; authorization belongs
in the function policy and server logic.

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

There is no separate v2 function publish. After every source change that should become visible,
publish the manifest once; the UI source and all declared functions are validated, built, stored,
and activated atomically:

\`\`\`bash
dsbx frame publish /files/<scope>/<frame-folder>/manifest.json
\`\`\`

If validation or any function build fails, no partial publication becomes active. Fix the reported
error and rerun the command.

For a legacy Frame, pass its entry source file instead:

\`\`\`bash
dsbx frame publish /files/<scope>/<frame>.tsx
\`\`\`

Do not use the \`publish_interactive_content_file\` tool: the CLI replaces it under Frames v2.
Other interactive-content tools remain available for Frame operations that the CLI does not cover
yet. Use \`dsbx frame --help\` as the authority for available operations.

Do not use \`mv\` or \`cp\` on a registered Frame folder: move and clone are not supported in this
initial scope.

${INTERACTIVE_CONTENT_AUTHORING_PROSE_V2}`;
