/** @ignoreswagger */
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import type { AvailableTool } from "@app/lib/api/assistant/workspace_capabilities";
import { listAvailableTools } from "@app/lib/api/assistant/workspace_capabilities";
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { apiError } from "@app/logger/withlogging";
import {
  isAgentMessageType,
  isUserMessageType,
} from "@app/types/assistant/conversation";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { ModelId } from "@app/types/shared/model_id";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

interface ReinforcementTestCaseMockAction {
  functionCallName: string;
  status: "succeeded" | "failed";
  params?: Record<string, unknown>;
  output?: string | null;
}

interface ReinforcementTestCaseMockFeedback {
  direction: "up" | "down";
  comment?: string;
}

interface ReinforcementTestCaseMockMessage {
  role: "user" | "agent";
  content: string;
  feedback?: ReinforcementTestCaseMockFeedback;
  actions?: ReinforcementTestCaseMockAction[];
}

interface ReinforcementTestCaseMockSkillTool {
  name: string;
  sId: string;
}

interface ReinforcementTestCaseMockSkillConfig {
  name: string;
  sId: string;
  description?: string;
  instructions?: string;
  tools?: ReinforcementTestCaseMockSkillTool[];
}

interface ReinforcementTestCaseWorkspaceContext {
  tools: AvailableTool[];
}

export interface ReinforcementTestCaseType {
  scenarioId: string;
  type: "analysis";
  skillConfigs: ReinforcementTestCaseMockSkillConfig[];
  conversation: ReinforcementTestCaseMockMessage[];
  workspaceContext: ReinforcementTestCaseWorkspaceContext;
  expectedToolCalls: [];
  judgeCriteria: string;
}

export type GetReinforcementTestCaseResponseBody = {
  testCase: ReinforcementTestCaseType;
};

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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetReinforcementTestCaseResponseBody>
  >,
  session: SessionWithUser
): Promise<void> {
  const { wId, cId } = req.query;
  if (!isString(wId) || !isString(cId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace or conversation ID.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);
  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const conversationRes = await getConversation(auth, cId, true);
  if (conversationRes.isErr()) {
    return apiError(req, res, {
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

  // Fetch feedbacks and index by agent message model id.
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

  // Build mock conversation messages (last version of each, only user and agent).
  const mockMessages: ReinforcementTestCaseMockMessage[] = [];
  for (const messageVersions of conversation.content) {
    if (messageVersions.length === 0) {
      continue;
    }
    const last = messageVersions[messageVersions.length - 1];
    if (isUserMessageType(last)) {
      mockMessages.push({
        role: "user",
        content: last.content,
      });
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
    workspaceContext: {
      tools: availableTools,
    },
    expectedToolCalls: [],
    judgeCriteria:
      "TODO: describe expected analyst behavior and scoring rubric.",
  };

  return res.status(200).json({ testCase });
}

export default withSessionAuthenticationForPoke(handler);
