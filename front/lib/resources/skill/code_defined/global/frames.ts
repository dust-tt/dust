import {
  buildInteractiveContentInstructions,
  INTERACTIVE_CONTENT_INSTRUCTIONS,
} from "@app/lib/api/actions/servers/interactive_content/instructions";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags, hasFeatureFlag } from "@app/lib/auth";
import { POD_FUNCTIONS_SKILL_NAME } from "@app/lib/resources/skill/code_defined/global/pod_functions";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import { isPodConversation } from "@app/types/assistant/conversation";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";

export const framesSkill = {
  sId: "frames",
  kind: "global",
  name: "Create Frames",
  userFacingDescription:
    "Turn insights into interactive dashboards and presentations your team can explore, customize," +
    " and share. Living documents that adapt to different stakeholders.",
  agentFacingDescription:
    "Create interactive visualizations, charts, dashboards, and presentations as executable React " +
    "components, and update existing ones (fix a chart, change data, colors, text, or layout). " +
    "These visualizations are typically called 'Frames' or 'Dust Frames' and can be " +
    "used in various contexts: daily digests, data analytics, sales reports, and more. Consider " +
    "using when tsx or React code is shared or available in the conversation. " +
    "Frames used to be a tool, now deprecated. Use this skill when the Frames/interactive " +
    "content tool is mentioned, and whenever asked to modify an existing Frame.",
  // Edit-the-source-then-publish guidance requires the conversation file system, which exposes
  // the Frame's source by path. Legacy conversations (created before the file system defaulted
  // on) keep the retrieve and file-id edit flow. Without a conversation at hand, assume the
  // file system is on since every new conversation has it.
  //
  // In a Pod, Frames are Pod apps: they live in the Pod's shared file system, and the ones holding
  // data the user expects to keep are backed by pod functions. Both only make sense with a
  // conversation to check, so a Pod-less agent loop keeps the conversation-scoped guidance.
  fetchInstructions: async (
    auth: Authenticator,
    params: { spaceIds: string[]; agentLoopData?: AgentLoopExecutionData }
  ) => {
    if (await hasFeatureFlag(auth, "frames_v2")) {
      return `# Frames v2

Frames are interactive React applications. This workspace supports two source formats:

## Frames v2 vs legacy Frames

- A Frames v2 source is a package-like folder anchored by \`manifest.json\`. The registered manifest is the canonical Frame resource; its folder contains the UI source, assets, and function source. The manifest declares metadata, one UI entry point (\`index.tsx\` by default), and any server functions. Publishing snapshots the whole folder, builds every declared function, and atomically activates the publication.
- A legacy (v1) Frame is anchored by a single \`.tsx\` entry file. Publishing resolves that entry file and its local imports, then updates the existing Frame through the legacy bundle pipeline.
- \`dsbx frame publish\` supports both formats. Edit and publish an existing legacy Frame in place; do not recreate it just to make it v2.

Use the Computer to edit Frame sources and the \`dsbx frame\` CLI to publish them.

## Publish a Frame

After every source change that should become visible:

\`\`\`bash
dsbx frame publish /files/<scope>/<frame-folder>/manifest.json
\`\`\`

For a legacy Frame, pass its entry source file instead:

\`\`\`bash
dsbx frame publish /files/<scope>/<frame>.tsx
\`\`\`

Fix any reported validation or build error and rerun the command. Do not use the \`publish_interactive_content_file\` tool: the CLI replaces it under Frames v2. Other interactive-content tools remain available for Frame operations that the CLI does not cover yet.

Use \`dsbx frame --help\` as the authority for available operations. Do not use \`mv\` or \`cp\` on a registered Frame folder: move and clone are not supported in this initial scope.`;
    }

    const conversation = params.agentLoopData?.conversation;
    if (conversation && conversation.metadata?.useFileSystem !== true) {
      return INTERACTIVE_CONTENT_INSTRUCTIONS;
    }

    const flags = await getFeatureFlags(auth);
    return buildInteractiveContentInstructions({
      hasComputer: isComputerFeatureEnabled(flags),
      isPod: conversation ? isPodConversation(conversation) : false,
      hasPodFunctions: flags.includes("sandbox_functions"),
      podFunctionsSkillName: POD_FUNCTIONS_SKILL_NAME,
    });
  },
  mcpServers: [{ name: "interactive_content" }],
  version: 4,
  icon: "ActionFrameIcon",
} as const satisfies GlobalSkillDefinition;
