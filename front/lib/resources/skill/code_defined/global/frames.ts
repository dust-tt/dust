import {
  buildInteractiveContentInstructions,
  INTERACTIVE_CONTENT_INSTRUCTIONS,
} from "@app/lib/api/actions/servers/interactive_content/instructions";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags, hasFeatureFlag } from "@app/lib/auth";
import { FRAME_SKILL_FILES } from "@app/lib/resources/skill/code_defined/global/frames/files";
import { buildFramesV2Instructions } from "@app/lib/resources/skill/code_defined/global/frames_v2";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import { isPodConversation } from "@app/types/assistant/conversation";
import {
  isComputerFeatureEnabled,
  isFramesV2FunctionsEnabled,
} from "@app/types/shared/feature_flags";

/**
 * @cc [owner:davidebbo,label:product] frame-functions-disclosure
 * Under frames_v2, function, database and persistent-file authoring guidance MUST be included
 * only when Frame functions are enabled (see isFramesV2FunctionsEnabled).
 */
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
  // In a Pod, legacy Frames are Pod apps: they live in the Pod's shared file system. Frames v2
  // start in the conversation and only go to the Pod when they belong there. Both only make sense
  // with a conversation to check, so a Pod-less agent loop keeps the conversation-scoped guidance.
  fetchInstructions: async (
    auth: Authenticator,
    params: { spaceIds: string[]; agentLoopData?: AgentLoopExecutionData }
  ) => {
    const flags = await getFeatureFlags(auth);
    const conversation = params.agentLoopData?.conversation;
    const isPod = conversation ? isPodConversation(conversation) : false;
    if (flags.includes("frames_v2")) {
      return buildFramesV2Instructions({
        hasFunctions: isFramesV2FunctionsEnabled(flags),
        isPod,
      });
    }

    if (conversation && conversation.metadata?.useFileSystem !== true) {
      return INTERACTIVE_CONTENT_INSTRUCTIONS;
    }

    return buildInteractiveContentInstructions({
      hasComputer: isComputerFeatureEnabled(flags),
      isPod,
    });
  },
  mcpServers: [
    { name: "interactive_content" },
    { name: "conversation_side_panel" },
  ],
  files: FRAME_SKILL_FILES,
  // Frames v2 authoring runs entirely through the Computer.
  warmsConversationSandbox: (auth: Authenticator) =>
    hasFeatureFlag(auth, "frames_v2"),
  version: 15,
  icon: "ActionFrameIcon",
} as const satisfies GlobalSkillDefinition;
