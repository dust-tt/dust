import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { shouldAutoGenerateTags } from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { runIncludeDataRetrieval } from "@app/lib/api/actions/servers/include_data/include_function";
import {
  INCLUDE_DATA_BASE_TOOLS_METADATA,
  INCLUDE_DATA_WITH_TAGS_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/include_data/metadata";
import { executeFindTags } from "@app/lib/api/actions/tools/find_tags";
import type { Authenticator } from "@app/lib/auth";

// Create tools with access to auth via closure
export function createIncludeDataTools(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
) {
  const areTagsDynamic = agentLoopContext
    ? shouldAutoGenerateTags(agentLoopContext)
    : false;

  if (!areTagsDynamic) {
    // Return base tools without tags
    const handlers: ToolHandlers<typeof INCLUDE_DATA_BASE_TOOLS_METADATA> = {
      retrieve_recent_documents: async (params, _extra) => {
        if (!agentLoopContext?.runContext) {
          throw new Error(
            "agentLoopRunContext is required where the tool is called."
          );
        }
        return runIncludeDataRetrieval(auth, agentLoopContext, params);
      },
    };
    return buildTools(INCLUDE_DATA_BASE_TOOLS_METADATA, handlers);
  }

  // Return tools with tags support
  const handlers: ToolHandlers<typeof INCLUDE_DATA_WITH_TAGS_TOOLS_METADATA> = {
    retrieve_recent_documents: async (params, _extra) => {
      if (!agentLoopContext?.runContext) {
        throw new Error(
          "agentLoopRunContext is required where the tool is called."
        );
      }
      return runIncludeDataRetrieval(auth, agentLoopContext, params);
    },
    find_tags: async ({ query, dataSources }, _extra) => {
      return executeFindTags(auth, query, dataSources);
    },
  };
  return buildTools(INCLUDE_DATA_WITH_TAGS_TOOLS_METADATA, handlers);
}
