import {
  INTERACTIVE_CONTENT_INSTRUCTIONS,
  INTERACTIVE_CONTENT_INSTRUCTIONS_COMPUTER_FIRST,
} from "@app/lib/api/actions/servers/interactive_content/instructions";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";

export const framesSkill = {
  sId: "frames",
  name: "Create Frames",
  userFacingDescription:
    "Turn insights into interactive dashboards and presentations your team can explore, customize," +
    " and share. Living documents that adapt to different stakeholders.",
  agentFacingDescription:
    "Create interactive visualizations, charts, dashboards, and presentations as executable React " +
    "components. These visualizations are typically called 'Frames' or 'Dust Frames' and can be " +
    "used in various contexts: daily digests, data analytics, sales reports, and more. Consider " +
    "using when tsx or React code is shared or available in the conversation. " +
    "Frames used to a be a tool, now deprecated. Use this skill when the Frames/interactive " +
    "content tool is mentioned.",
  // Computer-first guidance (edit the mounted source in place, then publish) is taught only when the
  // Computer and frame_publish are both available. Otherwise the model updates Frames through the
  // retrieve and edit tools.
  fetchInstructions: async (
    auth: Authenticator,
    _params: { spaceIds: string[]; agentLoopData?: AgentLoopExecutionData }
  ) => {
    const flags = await getFeatureFlags(auth);
    const computerFirst =
      flags.includes("frame_publish") && isComputerFeatureEnabled(flags);
    return computerFirst
      ? INTERACTIVE_CONTENT_INSTRUCTIONS_COMPUTER_FIRST
      : INTERACTIVE_CONTENT_INSTRUCTIONS;
  },
  mcpServers: [{ name: "interactive_content" }],
  version: 3,
  icon: "ActionFrameIcon",
} as const satisfies GlobalSkillDefinition;
