import type { AnalyticsViewInput } from "@app/components/workspace/analytics/analyticsView";
import { describeAnalyticsView } from "@app/components/workspace/analytics/analyticsView";
import { usageFilterToIds } from "@app/components/workspace/analytics/usageFilter";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const ANALYTICS_PANEL_SERVER_NAME = "analytics-panel-client";
export const GET_ANALYTICS_VIEW_TOOL_NAME = "get_analytics_view";

const DESCRIPTION = `Read the period and filters the user currently has applied on the workspace \
Analytics page.

Call this before answering anything that refers to what the user sees ("this", "these agents", \
"my filters") and again on every later turn that depends on the view, since the user can change \
the filters at any moment.

Forward every key of \`toolArguments\` unchanged to the workspace analytics tools so your figures \
match what is on screen. An absent key means no filter on that dimension.

\`granularity\` is the bucket size for get_credit_timeseries. \`dimension\` is the current \
breakdown, passed as \`dimension\` to the ranking tools and \`breakdownBy\` to \
get_credit_timeseries. \`description\` is display text for the user. None of the three is a filter.`;

/**
 * @cc [owner:achilleburah,label:mcp;product] tool-arguments-are-pass-through
 * Every key of `toolArguments` MUST be a valid argument, under that exact name, of every
 * `workspace_analytics` tool that accepts filters, so the agent can forward them unchanged.
 */
export function analyticsViewToolPayload(view: AnalyticsViewInput) {
  const ids = usageFilterToIds(view.filter);

  return {
    toolArguments: {
      period: view.period.kind,
      ...(view.period.kind === "days" && { days: view.period.days }),
      agentIds: ids.agent,
      userIds: ids.user,
      groupIds: ids.group,
      modelIds: ids.model,
      toolNames: ids.tool,
      skillIds: ids.skill,
      sources: ids.source,
      apiKeyNames: ids.api_key,
    },
    granularity: view.granularity,
    dimension: view.dimension,
    description: describeAnalyticsView(view),
  };
}

export function registerGetAnalyticsViewTool(
  mcpServer: McpServer,
  getView: () => AnalyticsViewInput
): void {
  mcpServer.registerTool(
    GET_ANALYTICS_VIEW_TOOL_NAME,
    {
      description: DESCRIPTION,
      _meta: {
        dust: {
          stake: "never_ask",
          eager: true,
          displayLabels: {
            running: "Reading the Analytics view",
            done: "Read the Analytics view",
          },
        },
      },
    },
    () => ({
      content: [
        {
          type: "text" as const,
          // TODO(achilleburah): move this to a markdown rather than JSON to remove unecessary tokens
          text: JSON.stringify(analyticsViewToolPayload(getView()), null, 2),
        },
      ],
    })
  );
}
