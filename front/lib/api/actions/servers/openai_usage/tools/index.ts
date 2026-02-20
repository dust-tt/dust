import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { OpenAIUsageClient } from "@app/lib/api/actions/servers/openai_usage/client";
import { getOpenAIUsageClient } from "@app/lib/api/actions/servers/openai_usage/client";
import { OPENAI_USAGE_TOOLS_METADATA } from "@app/lib/api/actions/servers/openai_usage/metadata";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types/shared/result";

const LIMIT_RULES = {
  "1d": { default: 7, max: 31 },
  "1h": { default: 24, max: 168 },
  "1m": { default: 60, max: 1440 },
} as const;

async function withClient(
  auth: Authenticator,
  agentLoopContext: AgentLoopContextType | undefined,
  action: (client: OpenAIUsageClient) => Promise<ToolHandlerResult>
): Promise<ToolHandlerResult> {
  const clientResult = await getOpenAIUsageClient(auth, agentLoopContext);
  if (clientResult.isErr()) {
    return clientResult;
  }
  return action(clientResult.value);
}

export function createOpenAIUsageTools(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
) {
  const handlers: ToolHandlers<typeof OPENAI_USAGE_TOOLS_METADATA> = {
    // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
    get_completions_usage: async (params, _extra: ToolHandlerExtra) => {
      return withClient(auth, agentLoopContext, async (client) => {
        const rule = LIMIT_RULES[params.bucket_width];
        const limit = params.limit ?? rule.default;

        if (limit > rule.max) {
          return new Err(
            new MCPError(
              `Limit ${limit} exceeds maximum allowed for bucket_width=${params.bucket_width}. Maximum is ${rule.max}.`,
              {
                tracked: false,
              }
            )
          );
        }

        const startTimeSeconds = Math.floor(
          new Date(params.start_time).getTime() / 1000
        );
        const endTimeSeconds = params.end_time
          ? Math.floor(new Date(params.end_time).getTime() / 1000)
          : undefined;

        const result = await client.getCompletionsUsage({
          start_time: startTimeSeconds,
          ...(endTimeSeconds && { end_time: endTimeSeconds }),
          bucket_width: params.bucket_width,
          ...(params.api_key_ids && { api_key_ids: params.api_key_ids }),
          ...(params.models && { models: params.models }),
          ...(params.project_ids && { project_ids: params.project_ids }),
          ...(params.user_ids && { user_ids: params.user_ids }),
          ...(params.batch !== undefined && { batch: params.batch }),
          ...(params.group_by && { group_by: params.group_by }),
          limit,
          ...(params.page && { page: params.page }),
        });

        if (result.isErr()) {
          return result;
        }

        return new Ok([
          {
            type: "text" as const,
            text: JSON.stringify(result.value, null, 2),
          },
        ]);
      });
    },

    // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
    get_organization_costs: async (params, _extra: ToolHandlerExtra) => {
      return withClient(auth, agentLoopContext, async (client) => {
        const startTimeSeconds = Math.floor(
          new Date(params.start_time).getTime() / 1000
        );
        const endTimeSeconds = params.end_time
          ? Math.floor(new Date(params.end_time).getTime() / 1000)
          : undefined;

        const result = await client.getOrganizationCosts({
          start_time: startTimeSeconds,
          ...(endTimeSeconds && { end_time: endTimeSeconds }),
          ...(params.group_by && { group_by: params.group_by }),
          limit: params.limit,
          ...(params.page && { page: params.page }),
          ...(params.project_ids && { project_ids: params.project_ids }),
        });

        if (result.isErr()) {
          return result;
        }

        return new Ok([
          {
            type: "text" as const,
            text: JSON.stringify(result.value, null, 2),
          },
        ]);
      });
    },
  };

  return buildTools(OPENAI_USAGE_TOOLS_METADATA, handlers);
}
