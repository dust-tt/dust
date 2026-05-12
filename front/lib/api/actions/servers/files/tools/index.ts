import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  FILES_CAT_ACTION_NAME,
  FILES_CREATE_ACTION_NAME,
  FILES_DELETE_ACTION_NAME,
  FILES_GREP_ACTION_NAME,
  FILES_LIST_ACTION_NAME,
  FILES_TOOLS_METADATA,
  FILES_TOOLS_METADATA_WITH_PROJECT,
} from "@app/lib/api/actions/servers/files/metadata";
import { catHandler } from "@app/lib/api/actions/servers/files/tools/cat";
import { createHandler } from "@app/lib/api/actions/servers/files/tools/create";
import { deleteHandler } from "@app/lib/api/actions/servers/files/tools/delete";
import { grepHandler } from "@app/lib/api/actions/servers/files/tools/grep";
import { listHandler } from "@app/lib/api/actions/servers/files/tools/list";

const COMMON_HANDLERS = {
  [FILES_CAT_ACTION_NAME]: catHandler,
  [FILES_GREP_ACTION_NAME]: grepHandler,
  [FILES_CREATE_ACTION_NAME]: createHandler,
  [FILES_DELETE_ACTION_NAME]: deleteHandler,
};

export const TOOLS = buildTools(FILES_TOOLS_METADATA, {
  [FILES_LIST_ACTION_NAME]: listHandler,
  ...COMMON_HANDLERS,
});

export const TOOLS_WITH_PROJECT = buildTools(FILES_TOOLS_METADATA_WITH_PROJECT, {
  [FILES_LIST_ACTION_NAME]: listHandler,
  ...COMMON_HANDLERS,
});
