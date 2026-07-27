import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { AGENT_LESS_DEFAULT_RETRIEVAL_TOP_K } from "@app/lib/api/actions/servers/data_sources_file_system/tools/search";
import { runIncludeDataRetrieval } from "@app/lib/api/actions/servers/include_data/include_function";
import {
  INCLUDE_DATA_BASE_TOOLS_METADATA,
  INCLUDE_DATA_WITH_TAGS_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/include_data/metadata";
import { executeFindTags } from "@app/lib/api/actions/tools/find_tags";

const baseHandlers: ToolHandlers<typeof INCLUDE_DATA_BASE_TOOLS_METADATA> = {
  retrieve_recent_documents: async (params, { auth, runContext }) => {
    const { retrievalTopK, citationsOffset } = isAgentLoopRunContext(runContext)
      ? runContext.stepContext
      : {
          retrievalTopK: AGENT_LESS_DEFAULT_RETRIEVAL_TOP_K,
          citationsOffset: 0,
        };
    return runIncludeDataRetrieval(auth, {
      ...params,
      citationsOffset,
      retrievalTopK,
    });
  },
};

const handlersWithTags: ToolHandlers<
  typeof INCLUDE_DATA_WITH_TAGS_TOOLS_METADATA
> = {
  retrieve_recent_documents: baseHandlers.retrieve_recent_documents,
  find_tags: async ({ query, dataSources }, { auth }) => {
    return executeFindTags(auth, query, dataSources);
  },
};

export const BASE_TOOLS = buildTools(
  INCLUDE_DATA_BASE_TOOLS_METADATA,
  baseHandlers
);
export const TOOLS_WITH_TAGS = buildTools(
  INCLUDE_DATA_WITH_TAGS_TOOLS_METADATA,
  handlersWithTags
);
