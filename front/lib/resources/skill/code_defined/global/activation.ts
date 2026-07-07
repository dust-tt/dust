import { isJITMCPServerView } from "@app/lib/actions/mcp_internal_actions/utils";
import { buildToolsetsContext } from "@app/lib/api/assistant/global_agents/configurations/dust/dust";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import logger from "@app/logger/logger";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import { isFavoritePlatform } from "@app/types/favorite_platforms";
import { isJobType, JOB_TYPE_LABELS } from "@app/types/job_type";
import { isStringArray } from "@app/types/shared/utils/general";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";

const ACTIVATION_BEHAVIOR = `
Recommend the next best action for the user to get more value from Dust. Help them execute it in this conversation, then offer to convert it into a saved skill and a recurring schedule.

## User Context

Before providing a new use case for the user, you MUST acquire context to inform your recommendation:
- Call \`get_personal_usage\` to understand what the user has already used in the last 30 days.
- Call \`get_workspace_activity\` to understand what the workspace has used in the last 30 days.
- Call \`list_skills\` to see what skills are pinned or available.

Do not recommend skills, tools, or agents that already appear in the user's personal usage results — they are already using those.
- Account for the data already provided to you, including user job type, user preferred tools, and the existing tools

## Recommend

Surface exactly one recommendation per turn. Follow this priority order. Move to the next tier only if the current tier yields no viable recommendation. Never explain the tier system to the user.

1. Pre-selected skills — Call \`list_skills\` to see what skills are pinned or available. Prioritize any that align with the user's stated goals or role.
2. Existing agents in this workspace — Call \`list_all_published_agents\` to see what agents exist. Recommend the one whose description best fits the user's work.
3. Curated use cases by job type — If no skills or agents are a clear fit, suggest a curated use case matched to the user's role. Keep setup steps minimal; note any required tool connections.
4. Personalized daily task manager - Connect primary daily sources (Slack, email, calendar) and set up a daily briefing.

Each recommendation includes:
- A 1-2 sentence rationale explaining why this is worth their time.
- An offer to execute it directly in this conversation — not just describe it.
- If applicable, a brief, skippable inline explanation of the relevant Dust concept (skill, trigger, schedule, Frame, etc.). One sentence, easy to ignore.

## After Successful Use Case Execution

Follow this sequence — do not offer it as a choice, just move through each step:

1. **Save as a skill** — Use the \`skill_authoring\` tools to save the workflow as a reusable skill. Confirm with the user before saving.
2. **Make it recurring** — Use the \`schedules_management\` tools to set up a recurring trigger. End this step with:

:quickReply[Set it up]{message="Yes, set this up to run on a schedule"} :quickReply[Skip]{message="No thanks, skip the schedule"}

## Accept / Reject

After surfacing a recommendation, always end with one-click options:

:quickReply[Let's try it]{message="Yes, let's try this now"} :quickReply[Not for me]{message="This isn't relevant to my work"} :quickReply[Tell me more]{message="Tell me more before we start"}

## Quality

- Be concise. Every message should be actionable in under 30 seconds of reading.
- Never block the user. If they want to skip, change direction, ask an unrelated question, or leave, let them.
- Always end messages with at least one \`quickReply\` button.
- If the user asks a question unrelated to recommendations, answer it helpfully, then gently steer back.
- Present recommendations naturally. Do not explain the priority tiers, the skill-pinning mechanism, or how this works. The user should feel like they're getting personalized suggestions, not being processed through a funnel.
`.trim();

async function buildActivationContext(
  auth: Authenticator,
  spaceIds: string[]
): Promise<string> {
  const parts: string[] = [];

  const user = auth.user();
  if (user) {
    const owner = auth.getNonNullableWorkspace();
    const [jobTypeMeta, platformsMeta] = await Promise.all([
      user.getMetadata("job_type"),
      user.getMetadata("favorite_platforms", owner.id),
    ]);

    const jobType = isJobType(jobTypeMeta?.value) ? jobTypeMeta.value : null;
    if (jobType) {
      parts.push(`User role: ${JOB_TYPE_LABELS[jobType]}`);
    }

    if (platformsMeta?.value) {
      const parsed = safeParseJSON(platformsMeta.value);
      if (
        parsed.isOk() &&
        isStringArray(parsed.value) &&
        parsed.value.every(isFavoritePlatform)
      ) {
        const platforms = parsed.value;
        if (platforms.length > 0) {
          parts.push(`Preferred tools: ${platforms.join(", ")}`);
        }
      }
    }
  }

  const allToolsets =
    await MCPServerViewResource.listBySpaceIdsEnsuringAutoViews(
      auth,
      spaceIds,
      { includeGlobalSpace: true }
    );
  const availableToolsets = allToolsets.filter((toolset) => {
    const mcpServerView = toolset.toJSON();
    return (
      isJITMCPServerView(mcpServerView) &&
      mcpServerView.server.availability !== "auto_hidden_builder"
    );
  });
  if (availableToolsets.length > 0) {
    parts.push(buildToolsetsContext(availableToolsets));
  }

  if (parts.length === 0) {
    return "";
  }

  return parts.join("\n\n");
}

export const activationSkill = {
  sId: "activation",
  kind: "global",
  name: "Activation",
  userFacingDescription:
    "Get a recommendation for the next best action to get more value from Dust, then execute it and make it a habit.",
  agentFacingDescription:
    "Use when the user wants a recommendation on what to try next in Dust. " +
    "Surfaces one action at a time from available workspace skills and agents, then helps the user " +
    "execute it, save it as a reusable skill, and set it up as a recurring schedule.",
  fetchInstructions: async (
    auth: Authenticator,
    { spaceIds }: { spaceIds: string[]; agentLoopData?: AgentLoopExecutionData }
  ): Promise<string> => {
    let context = "";
    try {
      context = await buildActivationContext(auth, spaceIds);
    } catch (err) {
      logger.warn({ err }, "Failed to build activation context");
    }
    return context
      ? `${context}\n\n${ACTIVATION_BEHAVIOR}`
      : ACTIVATION_BEHAVIOR;
  },
  mcpServers: [
    { name: "user_analytics" },
    { name: "agent_router" },
    { name: "skill_authoring" },
    { name: "schedules_management" },
    { name: "files" },
  ],
  version: 2,
  icon: "ActionRocketIcon",
  isRestricted: async (auth) => {
    const flags = await getFeatureFlags(auth);
    return !flags.includes("activation_skill");
  },
} as const satisfies GlobalSkillDefinition;
