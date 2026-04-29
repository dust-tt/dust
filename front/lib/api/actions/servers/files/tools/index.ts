import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  FILES_CAT_ACTION_NAME,
  FILES_GREP_ACTION_NAME,
  FILES_LIST_ACTION_NAME,
  FILES_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/files/metadata";
import { catHandler } from "@app/lib/api/actions/servers/files/tools/cat";
import { grepHandler } from "@app/lib/api/actions/servers/files/tools/grep";
import { listHandler } from "@app/lib/api/actions/servers/files/tools/list";

export const TOOLS = buildTools(FILES_TOOLS_METADATA, {
  [FILES_LIST_ACTION_NAME]: listHandler,
  [FILES_CAT_ACTION_NAME]: catHandler,
  [FILES_GREP_ACTION_NAME]: grepHandler,
});
