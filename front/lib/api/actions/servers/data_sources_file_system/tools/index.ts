import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA, DATA_SOURCES_FILE_SYSTEM_TOOLS_WITH_TAGS_METADATA,
  FILESYSTEM_CAT_TOOL_NAME,
  FILESYSTEM_FIND_TOOL_NAME,
  FILESYSTEM_HEAD_TOOL_NAME,
  FILESYSTEM_LIST_TOOL_NAME,
  FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME,
  FILESYSTEM_SEARCH_TOOL_NAME,
  FILESYSTEM_TAIL_TOOL_NAME,
  FIND_TAGS_TOOL_NAME
} from "@app/lib/api/actions/servers/data_sources_file_system/metadata";
import { cat } from "@app/lib/api/actions/servers/data_sources_file_system/tools/cat";
import { find } from "@app/lib/api/actions/servers/data_sources_file_system/tools/find";
import { head } from "@app/lib/api/actions/servers/data_sources_file_system/tools/head";
import { list } from "@app/lib/api/actions/servers/data_sources_file_system/tools/list";
import { locateTree } from "@app/lib/api/actions/servers/data_sources_file_system/tools/locate_tree";
import { search } from "@app/lib/api/actions/servers/data_sources_file_system/tools/search";
import { tail } from "@app/lib/api/actions/servers/data_sources_file_system/tools/tail";
import { executeFindTags } from "@app/lib/api/actions/tools/find_tags";
import { Err } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA> = {
  [FILESYSTEM_CAT_TOOL_NAME]: cat,
  [FILESYSTEM_HEAD_TOOL_NAME]: head,
  [FILESYSTEM_TAIL_TOOL_NAME]: tail,
  [FILESYSTEM_LIST_TOOL_NAME]: list,
  [FILESYSTEM_FIND_TOOL_NAME]: find,
  [FILESYSTEM_SEARCH_TOOL_NAME]: search,
  [FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME]: locateTree,
};

const handlersWithTags: ToolHandlers<
  typeof DATA_SOURCES_FILE_SYSTEM_TOOLS_WITH_TAGS_METADATA
> = {
  ...handlers,
  [FIND_TAGS_TOOL_NAME]: async ({ query, dataSources }, { auth }) => {
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }
    return executeFindTags(query, dataSources, auth);
  },
};

export const TOOLS_WITHOUT_TAGS = buildTools(
  DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA,
  handlers
);

export const TOOLS_WITH_TAGS = buildTools(
  DATA_SOURCES_FILE_SYSTEM_TOOLS_WITH_TAGS_METADATA,
  handlersWithTags
);
