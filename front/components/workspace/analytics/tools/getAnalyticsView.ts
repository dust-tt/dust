import type { AnalyticsViewInput } from "@app/components/workspace/analytics/analyticsView";
import { describeAnalyticsView } from "@app/components/workspace/analytics/analyticsView";
import { usageFilterToIds } from "@app/components/workspace/analytics/usageFilter";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const GET_ANALYTICS_VIEW_TOOL_NAME = "get_analytics_view";

const DESCRIPTION = `Read the period and filters the user currently has applied on the workspace \
Analytics page they are looking at.

Call this before answering any question that refers to what the user sees — "this", "these agents", \
"the current view", "my filters" — and call it again on every later turn that depends on the view: \
the user can change the filters at any moment, so an earlier reading goes stale.

Forward every key of \`toolArguments\` unchanged to the workspace analytics tools so your figures \
match what is on screen. A key that is absent means the user filters nothing on that dimension; \
never substitute an empty array for it.

\`granularity\` is the bucket size to pass to get_credit_timeseries, \`dimension\` is what the user \
is currently breaking down by, and \`description\` is display text for talking to the user. None of \
the three is a filter.`;

/**
 * @cc [owner:achilleburah,label:mcp;product] tool-arguments-are-pass-through
 * Every key of `toolArguments` MUST be a valid argument, under that exact name, of every
 * `workspace_analytics` tool that accepts filters, so the agent can forward them unchanged.
 * A dimension the user does not filter on MUST be absent rather than an empty array, which the
 * consumption endpoints would read as "match nothing".
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
          // The page state is already in the browser, and prompting to read what the user is
          // looking at would land on most turns.
          stake: "never_ask",
          // Answering "what am I looking at" must not cost a tool-search hop first.
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
          text: JSON.stringify(analyticsViewToolPayload(getView()), null, 2),
        },
      ],
    })
  );
}
