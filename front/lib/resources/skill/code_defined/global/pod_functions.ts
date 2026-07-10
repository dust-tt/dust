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
    "Give Frames a typed backend, or a way to turn a multi-step task into one reusable function.",
  agentFacingDescription:
    "A pod function is a versioned, typed server-side function stored on the Pod, callable by " +
    "slug from this conversation or from a Frame's own runtime. It unblocks a Frame from having " +
    "to run something itself: reaching a server-side capability its browser sandbox cannot (an " +
    "external API call, a workspace secret, logic no client code should hold), reusing a " +
    "multi-step operation (several API calls, some branching, a non-trivial computation) behind " +
    "one typed contract instead of redoing it by hand every time, or reading and writing data " +
    "that outlives a single conversation, so a Frame calling the function keeps showing current " +
    "state even when that state was last written from somewhere else.",
  // TODO(POD_FUNCTION: JD): the "Persisting state across calls" section below is a placeholder header only;
  // fill in the SQLite/db() story once it's finalized.
  instructions: `Pod functions are versioned, typed callables stored on the Pod. Each one is a
TypeScript module with zod-typed input and output, bundled on the Pod's sandbox at publish time and
reusable across conversations in the same Pod, callable from a Frame's own runtime or directly
from this conversation with the call tool described below.

Reach for a pod function instead of inline code or an ad hoc tool call when any of these apply:

- A Frame needs a server-side capability it cannot run inside its own browser sandbox: an
  external API call, a workspace secret, or logic no client-side code should hold.
- The same multi-step operation (several API calls, some branching, a non-trivial computation)
  keeps getting redone by hand and is worth collapsing behind one typed input/output contract.
- Data needs to persist beyond one call and be shared across writers: written from this
  conversation or another conversation in the same Pod, then read back by a Frame that always
  shows the latest state without needing the conversation that wrote it (see "Persisting state
  across calls" below).

#### Authoring a function

Write the source as a TypeScript file on the Pod file system (the sandbox mount \`/files/pod\`, or
through the \`files\` MCP server under a \`pod-<podId>/<rel>\` path). The module must:

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

#### Publishing, discovering, and invoking

Once the source is on the Pod, use the \`publish\` tool to build it. Publishing bundles and
type-checks the source on the sandbox and extracts the input and output JSON schemas from the
\`schema\` export. Publishing again under the same name replaces the previous version. The stored
bundle is owned by the platform and runs from a read-only mount, so a published function can be
executed but never overwritten from within a sandbox.

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
