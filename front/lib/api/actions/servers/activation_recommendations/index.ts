import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import type { ACTIVATION_RECOMMENDATIONS_TOOLS_METADATA } from "@app/lib/api/actions/servers/activation_recommendations/metadata";
import { ActivationRecommendationResource } from "@app/lib/resources/activation_recommendation_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { Err, Ok } from "@app/types/shared/result";

export const ACTIVATION_RECOMMENDATIONS_TOOL_HANDLERS: ToolHandlers<
  typeof ACTIVATION_RECOMMENDATIONS_TOOLS_METADATA
> = {
  create_recommendation: async (
    { content, rationale },
    { auth, runContext }
  ) => {
    const conversationId = isAgentLoopRunContext(runContext)
      ? runContext.conversation.id
      : null;

    const rec = await ActivationRecommendationResource.makeNew(auth, {
      content,
      rationale,
      conversationId,
    });

    return new Ok([
      {
        type: "text" as const,
        text: `Recommendation recorded. recommendationId: ${rec.sId}`,
      },
    ]);
  },

  update_recommendation: async (
    { recommendationId, status, createdSkillId, createdTriggerId },
    { auth }
  ) => {
    const rec = await ActivationRecommendationResource.fetchById(
      auth,
      recommendationId
    );

    if (!rec) {
      return new Err(
        new MCPError(`Recommendation not found: ${recommendationId}.`)
      );
    }

    if (rec.userId !== auth.getNonNullableUser().id) {
      return new Err(
        new MCPError(
          `Cannot update recommendation ${recommendationId}: not owned by the calling user.`
        )
      );
    }

    let createdSkillModelId: number | undefined;
    let createdTriggerModelId: number | undefined;

    if (createdSkillId) {
      const skill = await SkillResource.fetchById(auth, createdSkillId);
      if (skill) {
        createdSkillModelId = skill.id;
      }
    }

    if (createdTriggerId) {
      const trigger = await TriggerResource.fetchById(auth, createdTriggerId);
      if (trigger) {
        createdTriggerModelId = trigger.id;
      }
    }

    await rec.updateFields({
      status,
      createdSkillModelId,
      createdTriggerModelId,
    });

    const statusMsg = status ? ` Status set to "${status}".` : "";
    const skillMsg = createdSkillModelId ? " Skill linked." : "";
    const triggerMsg = createdTriggerModelId ? " Trigger linked." : "";

    return new Ok([
      {
        type: "text" as const,
        text: `Recommendation updated.${statusMsg}${skillMsg}${triggerMsg}`,
      },
    ]);
  },

  list_recommendations: async (_params, { auth }) => {
    const recs = await ActivationRecommendationResource.fetchByUser(auth);

    if (recs.length === 0) {
      return new Ok([
        {
          type: "text" as const,
          text: "No previous recommendations for this user.",
        },
      ]);
    }

    const lines = recs.map((r, i) => {
      const statusLabel =
        r.status === "suggested"
          ? "shown (no decision yet)"
          : r.status === "executed"
            ? "accepted"
            : "dismissed";
      return `${i + 1}. [${statusLabel}] ${r.content}`;
    });

    return new Ok([
      {
        type: "text" as const,
        text: `Previous recommendations (${recs.length}):\n${lines.join("\n")}`,
      },
    ]);
  },
};
