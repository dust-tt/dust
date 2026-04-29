import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  FILES_LIST_ACTION_NAME,
  FILES_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/files/metadata";
import { listHandler } from "@app/lib/api/actions/servers/files/tools/list";

export const TOOLS = buildTools(FILES_TOOLS_METADATA, {
  [FILES_LIST_ACTION_NAME]: listHandler,
});
