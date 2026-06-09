import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { listAvailableTools } from "@app/lib/api/assistant/workspace_capabilities";
import type {
  GetReinforcementTestCaseResponseBody,
  ReinforcementTestCaseMockAction,
  ReinforcementTestCaseMockFeedback,
  ReinforcementTestCaseMockMessage,
  ReinforcementTestCaseMockSkillConfig,
  ReinforcementTestCaseMockSkillTool,
  ReinforcementTestCaseType,
} from "@app/lib/api/poke/conversations";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import {
  isAgentMessageType,
  isUserMessageType,
} from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
});

function serializeActionOutput(
  output: Array<{ type: string; text?: string }> | null | undefined
): string | null {
  if (!output) {
    return null;
  }
  const texts = output
    .filter(
      (block): block is { type: "text"; text: string } =>
        block.type === "text" && typeof block.text === "string"
    )
    .map((block) => block.text);
  return texts.length > 0 ? texts.join("\n") : null;
}

// Mounted at /api/poke/workspaces/:wId/conversations/:cId/reinforcement_test_case.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetReinforcementTestCaseResponseBody> => {
    const auth = ctx.get("auth");
    const { cId } = ctx.req.valid("param");

    const conversationRes = await getConversation(auth, cId, true);
    if (conversationRes.isErr()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: conversationRes.error.message,
        },
      });
    }
    const conversation = conversationRes.value;

    const skills = await SkillResource.listByConversationModelId(
      auth,
      conversation.id
    );

    const skillConfigs: ReinforcementTestCaseMockSkillConfig[] = skills.map(
      (skill) => {
        const tools: ReinforcementTestCaseMockSkillTool[] = skill.mcpServerViews
          .map((view) => {
            const viewJson = view.toJSON();
            if (!viewJson) {
              return null;
            }
            return {
              name: getMcpServerViewDisplayName(viewJson),
              sId: viewJson.sId,
            };
          })
          .filter((t): t is ReinforcementTestCaseMockSkillTool => t !== null);

        const config: ReinforcementTestCaseMockSkillConfig = {
          name: skill.name,
          sId: skill.sId,
          description: skill.agentFacingDescription,
        };
        if (skill.instructions) {
          config.instructions = skill.instructions;
        }
        if (tools.length > 0) {
          config.tools = tools;
        }
        return config;
      }
    );

    const feedbacks =
      await AgentMessageFeedbackResource.listByConversationModelId(
        auth,
        conversation.id
      );
    const feedbackByAgentMessageModelId = new Map<
      ModelId,
      ReinforcementTestCaseMockFeedback
    >();
    for (const f of feedbacks) {
      if (feedbackByAgentMessageModelId.has(f.agentMessageId)) {
        continue;
      }
      const feedback: ReinforcementTestCaseMockFeedback = {
        direction: f.thumbDirection,
      };
      if (f.content) {
        feedback.comment = f.content;
      }
      feedbackByAgentMessageModelId.set(f.agentMessageId, feedback);
    }

    const mockMessages: ReinforcementTestCaseMockMessage[] = [];
    for (const messageVersions of conversation.content) {
      if (messageVersions.length === 0) {
        continue;
      }
      const last = messageVersions[messageVersions.length - 1];
      if (isUserMessageType(last)) {
        mockMessages.push({ role: "user", content: last.content });
      } else if (isAgentMessageType(last)) {
        const actions: ReinforcementTestCaseMockAction[] = last.actions.map(
          (a) => {
            const action: ReinforcementTestCaseMockAction = {
              functionCallName: a.functionCallName,
              status: a.status === "succeeded" ? "succeeded" : "failed",
            };
            if (a.params && Object.keys(a.params).length > 0) {
              action.params = a.params;
            }
            const output = serializeActionOutput(a.output);
            if (output !== null) {
              action.output = output;
            }
            return action;
          }
        );
        const feedback = feedbackByAgentMessageModelId.get(last.agentMessageId);
        const message: ReinforcementTestCaseMockMessage = {
          role: "agent",
          content: last.content ?? "",
        };
        if (actions.length > 0) {
          message.actions = actions;
        }
        if (feedback) {
          message.feedback = feedback;
        }
        mockMessages.push(message);
      }
    }

    const availableTools = await listAvailableTools(auth);

    const testCase: ReinforcementTestCaseType = {
      scenarioId: conversation.sId,
      type: "analysis",
      skillConfigs,
      conversation: mockMessages,
      workspaceContext: { tools: availableTools },
      expectedToolCalls: [],
      judgeCriteria:
        "TODO: describe expected analyst behavior and scoring rubric.",
    };

    return ctx.json({ testCase });
  }
);

export default app;
