import { SANDBOX_FUNCTIONS_SERVER_NAME } from "@app/lib/api/actions/servers/sandbox_functions/metadata";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/global/types";
import { isPodConversation } from "@app/types/assistant/conversation";

export const podFunctionsSkill = {
  sId: "pod_functions",
  kind: "global",
  name: "Pod Functions",
  userFacingDescription:
    "Author and publish reusable, schema-typed functions that run on the Pod's sandbox.",
  agentFacingDescription:
    "Publish reusable TypeScript functions to the Pod and inspect the ones already published. " +
    "A function is a typed input/output handler bundled and stored on the Pod to back Frames: a " +
    "Frame can call a published function to reach a server-side capability behind a typed contract. " +
    "Enable this skill to turn a sandbox script into a published, named function a Frame can call.",
  instructions: `Pod functions are versioned, typed callables stored on the Pod. Each one is a
TypeScript module with zod-typed input and output, bundled on the Pod's sandbox at publish time and
reusable across conversations in the same Pod. They exist to back Frames: a Frame can call a
published function to reach a server-side capability behind a typed contract.

#### Authoring a function

Write the source as a TypeScript file on the Pod file system (the sandbox mount \`/files/pod\`, or
through the \`files\` MCP server under a \`pod-{podId}/<rel>\` path). The module must:

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

#### Publishing and discovering

Once the source is on the Pod, use the \`publish\` tool to build it. Publishing bundles and
type-checks the source on the sandbox and extracts the input and output JSON schemas from the
\`schema\` export. Publishing again under the same name replaces the previous version. The stored
bundle is owned by the platform and runs from a read-only mount, so a published function can be
executed but never overwritten from within a sandbox.

Use the \`list\` and \`get\` tools to see what the Pod has already published and to inspect a
function's contract before relying on it. See each tool's own description for its arguments.`,
  mcpServers: [{ name: SANDBOX_FUNCTIONS_SERVER_NAME }],
  version: 1,
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
  isAutoEquippedForAgentLoop: (): boolean => true,
} as const satisfies GlobalSkillDefinition;
