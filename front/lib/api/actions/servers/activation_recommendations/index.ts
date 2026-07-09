import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import {
  ACTIVATION_RECOMMENDATIONS_SERVER_NAME,
  ACTIVATION_RECOMMENDATIONS_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/activation_recommendations/metadata";
import type { Authenticator } from "@app/lib/auth";
import { ActivationRecommendationResource } from "@app/lib/resources/activation_recommendation_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { Err, Ok } from "@app/types/shared/result";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const handlers: ToolHandlers<typeof ACTIVATION_RECOMMENDATIONS_TOOLS_METADATA> =
  {
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

function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): McpServer {
  const server = makeInternalMCPServer(ACTIVATION_RECOMMENDATIONS_SERVER_NAME);

  const tools = buildTools(ACTIVATION_RECOMMENDATIONS_TOOLS_METADATA, handlers);
  for (const tool of tools) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: ACTIVATION_RECOMMENDATIONS_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
