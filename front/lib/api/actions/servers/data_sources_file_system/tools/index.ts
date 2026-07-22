import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  type DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA,
  type DATA_SOURCES_FILE_SYSTEM_TOOLS_WITH_TAGS_METADATA,
  FILESYSTEM_CAT_TOOL_NAME,
  FILESYSTEM_FIND_TOOL_NAME,
  FILESYSTEM_LIST_TOOL_NAME,
  FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME,
  FILESYSTEM_SEARCH_TOOL_NAME,
  FIND_TAGS_TOOL_NAME,
} from "@app/lib/api/actions/servers/data_sources_file_system/metadata";
import { cat } from "@app/lib/api/actions/servers/data_sources_file_system/tools/cat";
import { find } from "@app/lib/api/actions/servers/data_sources_file_system/tools/find";
import { list } from "@app/lib/api/actions/servers/data_sources_file_system/tools/list";
import { locateTree } from "@app/lib/api/actions/servers/data_sources_file_system/tools/locate_tree";
import { search } from "@app/lib/api/actions/servers/data_sources_file_system/tools/search";
import { executeFindTags } from "@app/lib/api/actions/tools/find_tags";

export const DATA_SOURCES_FILE_SYSTEM_TOOL_HANDLERS: ToolHandlers<
  typeof DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA
> = {
  [FILESYSTEM_CAT_TOOL_NAME]: cat,
  [FILESYSTEM_LIST_TOOL_NAME]: list,
  [FILESYSTEM_FIND_TOOL_NAME]: find,
  [FILESYSTEM_SEARCH_TOOL_NAME]: search,
  [FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME]: locateTree,
};

export const DATA_SOURCES_FILE_SYSTEM_TOOL_HANDLERS_WITH_TAGS: ToolHandlers<
  typeof DATA_SOURCES_FILE_SYSTEM_TOOLS_WITH_TAGS_METADATA
> = {
  ...DATA_SOURCES_FILE_SYSTEM_TOOL_HANDLERS,
  [FIND_TAGS_TOOL_NAME]: async ({ query, dataSources }, { auth }) => {
    return executeFindTags(auth, query, dataSources);
  },
};
