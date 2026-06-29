import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { SANDBOX_FUNCTIONS_TOOLS_METADATA } from "@app/lib/api/actions/servers/sandbox_functions/metadata";
import { getHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/get";
import { listHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/list";

const HANDLERS = {
  list: listHandler,
  get: getHandler,
};

export const TOOLS = buildTools(SANDBOX_FUNCTIONS_TOOLS_METADATA, HANDLERS);
