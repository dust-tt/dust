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
  // TODO(POD_FUNCTION: JD/spolu): the SQLite/db() story for "Persisting state across calls"
  // below still needs to be filled in.
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

The only external package you can import is \`zod\`. Other npm packages are not available at build
time.

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
