import {
  INTERACTIVE_CONTENT_INSTRUCTIONS,
  INTERACTIVE_CONTENT_INSTRUCTIONS_COMPUTER_FIRST,
  INTERACTIVE_CONTENT_INSTRUCTIONS_FILES_FIRST,
} from "@app/lib/api/actions/servers/interactive_content/instructions";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
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
  fetchInstructions: async (
    auth: Authenticator,
    params: { spaceIds: string[]; agentLoopData?: AgentLoopExecutionData }
  ) => {
    const conversation = params.agentLoopData?.conversation;
    if (conversation && conversation.metadata?.useFileSystem !== true) {
      return INTERACTIVE_CONTENT_INSTRUCTIONS;
    }

    const flags = await getFeatureFlags(auth);
    return isComputerFeatureEnabled(flags)
      ? INTERACTIVE_CONTENT_INSTRUCTIONS_COMPUTER_FIRST
      : INTERACTIVE_CONTENT_INSTRUCTIONS_FILES_FIRST;
  },
  mcpServers: [{ name: "interactive_content" }],
  version: 3,
  icon: "ActionFrameIcon",
} as const satisfies GlobalSkillDefinition;
