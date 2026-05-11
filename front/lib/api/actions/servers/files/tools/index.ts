import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  FILES_CAT_ACTION_NAME,
  FILES_COPY_ACTION_NAME,
  FILES_CREATE_ACTION_NAME,
  FILES_DELETE_ACTION_NAME,
  FILES_GREP_ACTION_NAME,
  FILES_LIST_ACTION_NAME,
  FILES_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/files/metadata";
import { catHandler } from "@app/lib/api/actions/servers/files/tools/cat";
import { copyHandler } from "@app/lib/api/actions/servers/files/tools/copy";
import { createHandler } from "@app/lib/api/actions/servers/files/tools/create";
import { deleteHandler } from "@app/lib/api/actions/servers/files/tools/delete";
import { grepHandler } from "@app/lib/api/actions/servers/files/tools/grep";
import { listHandler } from "@app/lib/api/actions/servers/files/tools/list";

export const TOOLS = buildTools(FILES_TOOLS_METADATA, {
  [FILES_LIST_ACTION_NAME]: listHandler,
  [FILES_CAT_ACTION_NAME]: catHandler,
  [FILES_GREP_ACTION_NAME]: grepHandler,
  [FILES_CREATE_ACTION_NAME]: createHandler,
  [FILES_DELETE_ACTION_NAME]: deleteHandler,
  [FILES_COPY_ACTION_NAME]: copyHandler,
});
