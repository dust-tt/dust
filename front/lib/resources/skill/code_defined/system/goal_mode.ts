import {
  GOAL_MODE_SERVER_NAME,
  UPDATE_GOAL_TOOL_NAME,
} from "@app/lib/api/actions/servers/goal_mode/metadata";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { ConversationGoalResource } from "@app/lib/resources/conversation_goal_resource";
import type { SystemSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";

export const goalModeSkill = {
  sId: "goal_mode",
  kind: "system",
  name: "Goal Mode",
  userFacingDescription:
    "Keep an agent working across autonomous turns until it explicitly completes or blocks the goal.",
  agentFacingDescription:
    "Persist across turns until the active user goal is fully achieved or genuinely blocked.",
  fetchInstructions: async (auth, { agentLoopData }) => {
    if (!agentLoopData) {
      return "";
    }
    const goal = await ConversationGoalResource.fetchActiveForAgentLoop(
      auth,
      agentLoopData
    );
    if (!goal) {
      return "";
    }

    return `
You are running in Goal Mode. The user has deliberately asked you to keep working across autonomous turns until the goal is fully achieved.

- Work concretely toward the whole active goal. Inspect prior progress before acting, avoid repeating completed work, and verify material results.
- An ordinary final response does not end Goal Mode. If you do not call \`${UPDATE_GOAL_TOOL_NAME}\`, the runtime will start another turn so you can continue.
- Call \`${UPDATE_GOAL_TOOL_NAME}\` with \`status: "complete"\` only when every part of the objective is achieved and the relevant verification is finished. Partial progress, a plausible plan, or running out of work for this turn is not completion.
- Call \`${UPDATE_GOAL_TOOL_NAME}\` with \`status: "blocked"\` only at a genuine impasse after exhausting safe in-scope alternatives, where progress requires user input, new authority, or an external-state change. Include the concrete blocker in \`reason\`.
- Do not pause, cancel, replace, or silently reinterpret the goal. Those lifecycle controls belong to the user and runtime.
- When calling \`${UPDATE_GOAL_TOOL_NAME}\`, make it your last tool call. After it succeeds, give the user one concise final summary of the outcome and verification, or of the blocker and what is needed to resume.
`;
  },
  mcpServers: [{ name: GOAL_MODE_SERVER_NAME }],
  version: 1,
  icon: "ActionCheckCircleIcon",
  isUserSelectable: false,
  isRestricted: async (auth: Authenticator) => {
    const featureFlags = await getFeatureFlags(auth);
    return !featureFlags.includes("goal_mode");
  },
  getAutoEnabledOrEquippedForAgentLoop: async ({ agentLoopData, auth }) => {
    if (!agentLoopData) {
      return undefined;
    }
    const goal = await ConversationGoalResource.fetchActiveForAgentLoop(
      auth,
      agentLoopData
    );
    return goal ? "enabled" : undefined;
  },
} as const satisfies SystemSkillDefinition;
