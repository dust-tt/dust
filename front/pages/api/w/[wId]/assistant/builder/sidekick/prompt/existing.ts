import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { AgentMessageFeedbackWithMetadataType } from "@app/lib/api/assistant/feedback";
import { getAgentFeedbacks } from "@app/lib/api/assistant/feedback";
import { fetchAgentOverview } from "@app/lib/api/assistant/observability/overview";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

const FEEDBACK_LIMIT = 50;
const OLDER_FEEDBACK_LIMIT = 10;
const OLDER_FEEDBACK_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 3 months
const INSIGHTS_DAYS = 30;

function buildFirstMessage({
  feedbackMarkdown,
  insightsMarkdown,
}: {
  feedbackMarkdown: string | null;
  insightsMarkdown: string | null;
}): string {
  const dataSections = [feedbackMarkdown, insightsMarkdown]
    .filter(Boolean)
    .join("\n\n");

  return `<dust_system>
This is an existing agent.

## STEP 1: Gather context
Call \`get_agent_config\` to retrieve the current agent configuration and any pending suggestions.

## STEP 2: Opening message
Based only on the information provided in <existing_agent_data_section> and the \`get_agent_config\` result:
- If reinforced suggestions exist (source="reinforcement"), highlight them
- If negative feedback patterns exist in the current agent version, mention it as the top issue. Feedback from previous versions are provided for reference, but should not be mentioned in the opening message.
- If pending suggestions exist from \`get_agent_config\`, output their directives to render them as cards:
  CRITICAL: For each suggestion, output: \`:agent_suggestion[]{sId=<sId> kind=<kind>}\`

In addition, ask the user if you should suggest additional improvements or if there is something specific they'd like to work on.
Keep the first message to 1–2 sentences (plus any suggestion cards). Response must fit in the sidekick panel without scrolling.
Do not make assumptions about the users's intent. Given that this is an existing agent, the user is likely to be asking for specific improvements or to work on a specific issue.

<existing_agent_data_section>
${dataSections ? `\n${dataSections}\n` : ""}
</existing_agent_data_section>

</dust_system>`;
}

function formatFeedbackItem(f: AgentMessageFeedbackWithMetadataType): string {
  const direction = f.thumbDirection === "up" ? "POSITIVE" : "NEGATIVE";
  const content = f.content ? `: ${f.content}` : "";
  return `- [${direction}]${content}`;
}

function appendFeedbackSection(
  lines: string[],
  title: string,
  items: AgentMessageFeedbackWithMetadataType[]
): void {
  if (items.length === 0) {
    return;
  }
  const positive = items.filter((f) => f.thumbDirection === "up").length;
  const negative = items.filter((f) => f.thumbDirection === "down").length;
  lines.push(
    "",
    `${title} (${items.length} total, ${positive} positive, ${negative} negative):`
  );
  for (const f of items) {
    lines.push(formatFeedbackItem(f));
  }
}

async function fetchFeedbackMarkdown(
  auth: Authenticator,
  agentConfigurationId: string
): Promise<string | null> {
  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: agentConfigurationId,
    variant: "light",
  });

  if (!agentConfiguration) {
    return null;
  }

  const currentVersion = agentConfiguration.version;

  const feedbacksRes = await getAgentFeedbacks({
    auth,
    agentConfigurationId,
    withMetadata: true,
    paginationParams: {
      limit: FEEDBACK_LIMIT,
      orderColumn: "id",
      orderDirection: "desc",
    },
    filter: "active",
  });

  if (feedbacksRes.isErr()) {
    logger.warn(
      { err: feedbacksRes.error },
      "Failed to fetch feedback for sidekick first message"
    );
    return null;
  }

  const feedbacks = feedbacksRes.value.filter(
    (f): f is AgentMessageFeedbackWithMetadataType => true
  );

  if (feedbacks.length === 0) {
    return null;
  }

  const latestVersionFeedback = feedbacks.filter(
    (f) => f.agentConfigurationVersion === currentVersion
  );

  const cutoffMs = Date.now() - OLDER_FEEDBACK_MAX_AGE_MS;
  const olderFeedback = feedbacks
    .filter(
      (f) =>
        f.agentConfigurationVersion !== currentVersion &&
        new Date(f.createdAt).getTime() >= cutoffMs
    )
    .slice(0, OLDER_FEEDBACK_LIMIT);

  if (latestVersionFeedback.length === 0 && olderFeedback.length === 0) {
    return null;
  }

  const lines = ["<feedback>"];

  appendFeedbackSection(
    lines,
    `Current version (v${currentVersion})`,
    latestVersionFeedback
  );
  appendFeedbackSection(lines, "Previous versions", olderFeedback);

  lines.push("</feedback>");
  return lines.join("\n");
}

async function fetchInsightsMarkdown(
  auth: Authenticator,
  agentConfigurationId: string
): Promise<string | null> {
  const owner = auth.getNonNullableWorkspace();
  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    agentId: agentConfigurationId,
    days: INSIGHTS_DAYS,
  });

  const overviewResult = await fetchAgentOverview(baseQuery, INSIGHTS_DAYS);

  if (overviewResult.isErr()) {
    logger.warn(
      { err: overviewResult.error },
      "Failed to fetch insights for sidekick first message"
    );
    return null;
  }

  const o = overviewResult.value;
  const lines = [
    "<insights>",
    `Period: last ${INSIGHTS_DAYS} days`,
    `Active users: ${o.activeUsers}`,
    `Conversations: ${o.conversationCount}`,
    `Messages: ${o.messageCount}`,
    `Feedback: ${o.positiveFeedbacks} positive, ${o.negativeFeedbacks} negative`,
    "</insights>",
  ];

  return lines.join("\n");
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<string>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET": {
      const { agentConfigurationId } = req.query;

      if (!isString(agentConfigurationId)) {
        return apiError(req, res, {
          status_code: 422,
          api_error: {
            type: "unprocessable_entity",
            message:
              "The agentConfigurationId query parameter is invalid or missing.",
          },
        });
      }

      const [feedbackMarkdown, insightsMarkdown] = await Promise.all([
        fetchFeedbackMarkdown(auth, agentConfigurationId),
        fetchInsightsMarkdown(auth, agentConfigurationId),
      ]);

      return res
        .status(200)
        .json(buildFirstMessage({ feedbackMarkdown, insightsMarkdown }));
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
