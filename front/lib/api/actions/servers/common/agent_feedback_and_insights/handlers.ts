import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerResult } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type {
  agentFeedbackSchema,
  agentInsightsSchema,
} from "@app/lib/api/actions/servers/common/agent_feedback_and_insights/metadata";
import type { AgentMessageFeedbackWithMetadataType } from "@app/lib/api/assistant/feedback";
import { getAgentFeedbacks } from "@app/lib/api/assistant/feedback";
import { fetchAgentOverview } from "@app/lib/api/assistant/observability/overview";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { Err, Ok } from "@app/types/shared/result";
import type { z } from "zod";

type AgentFeedbackInput = z.input<z.ZodObject<typeof agentFeedbackSchema>>;
type AgentInsightsInput = z.input<z.ZodObject<typeof agentInsightsSchema>>;

// Same access rule as the agent's feedback and observability endpoints: readers of the agent, or
// workspace admins.
async function fetchReadableAgent(
  auth: Authenticator,
  agentConfigurationId: string
): Promise<AgentResource | null> {
  const agent = await AgentResource.fetchById(auth, agentConfigurationId);
  if (!agent || (!auth.can("read", agent) && !auth.isAdmin())) {
    return null;
  }
  return agent;
}

export async function getAgentFeedbackToolResult(
  auth: Authenticator,
  {
    agentConfigurationId,
    limit,
    filter,
    latestVersionOnly,
  }: AgentFeedbackInput & { agentConfigurationId: string }
): Promise<ToolHandlerResult> {
  const latestVersionOnlyWithDefault = latestVersionOnly ?? true;

  const agent = await fetchReadableAgent(auth, agentConfigurationId);
  if (!agent) {
    return new Err(
      new MCPError(`Agent configuration not found: ${agentConfigurationId}`, {
        tracked: false,
      })
    );
  }

  const currentVersion = agent.currentVersion;

  const feedbacksRes = await getAgentFeedbacks({
    auth,
    agentConfigurationId,
    withMetadata: true,
    paginationParams: {
      limit: limit ?? 50,
      orderColumn: "id",
      orderDirection: "desc",
    },
    filter: filter ?? "active",
    ...(latestVersionOnlyWithDefault ? { version: currentVersion } : {}),
  });

  if (feedbacksRes.isErr()) {
    return new Err(
      new MCPError(`Failed to fetch feedback: ${feedbacksRes.error.message}`, {
        tracked: false,
      })
    );
  }

  const feedbacks = feedbacksRes.value.filter(
    (f): f is AgentMessageFeedbackWithMetadataType => true
  );

  const mapFeedback = (f: AgentMessageFeedbackWithMetadataType) => ({
    sId: f.sId,
    thumbDirection: f.thumbDirection,
    content: f.content,
    createdAt: f.createdAt,
    agentConfigurationVersion: f.agentConfigurationVersion,
    userName: f.userName,
    conversationId: f.conversationId,
  });

  const currentVersionFeedbackList = feedbacks
    .filter((f) => f.agentConfigurationVersion === currentVersion)
    .map(mapFeedback);
  const previousVersionsFeedbackList = feedbacks
    .filter((f) => f.agentConfigurationVersion !== currentVersion)
    .map(mapFeedback);

  const summary = {
    total: feedbacks.length,
    positive: feedbacks.filter((f) => f.thumbDirection === "up").length,
    negative: feedbacks.filter((f) => f.thumbDirection === "down").length,
  };

  return new Ok([
    {
      type: "text" as const,
      text: JSON.stringify(
        {
          agentConfigurationId,
          summary,
          current_version_feedback: currentVersionFeedbackList,
          ...(latestVersionOnlyWithDefault
            ? {}
            : { previous_versions_feedback: previousVersionsFeedbackList }),
        },
        null,
        2
      ),
    },
  ]);
}

/**
 * @cc [owner:avervaet,label:mcp;security] agent-insights-require-read
 * The agent id is caller-supplied: MUST fail with a not-found error, returning no figures, unless
 * the caller holds `read` on the agent or is a workspace admin. Fetchability of the agent alone
 * MUST NOT grant access.
 */
export async function getAgentInsightsToolResult(
  auth: Authenticator,
  {
    agentConfigurationId,
    days,
  }: AgentInsightsInput & { agentConfigurationId: string }
): Promise<ToolHandlerResult> {
  const agent = await fetchReadableAgent(auth, agentConfigurationId);
  if (!agent) {
    return new Err(
      new MCPError(`Agent configuration not found: ${agentConfigurationId}`, {
        tracked: false,
      })
    );
  }

  const numberOfDays = days ?? 30;

  const [feedbackCounts, overviewResult] = await Promise.all([
    AgentMessageFeedbackResource.getFeedbackCountForAssistant(
      auth,
      agentConfigurationId,
      numberOfDays
    ),
    fetchAgentOverview(auth, {
      agentId: agentConfigurationId,
      days: numberOfDays,
    }),
  ]);

  if (overviewResult.isErr()) {
    return new Err(
      new MCPError(
        `Failed to fetch agent insights: ${overviewResult.error.message}`,
        { tracked: false }
      )
    );
  }

  const overview = overviewResult.value;

  const insights = {
    agentConfigurationId,
    agentName: agent.name,
    period: {
      days: numberOfDays,
    },
    overview: {
      activeUsers: overview.activeUsers,
      conversationCount: overview.conversationCount,
      messageCount: overview.messageCount,
      feedback: {
        positive: feedbackCounts.positive,
        negative: feedbackCounts.negative,
        total: feedbackCounts.positive + feedbackCounts.negative,
      },
    },
  };

  return new Ok([
    {
      type: "text" as const,
      text: JSON.stringify(insights, null, 2),
    },
  ]);
}
