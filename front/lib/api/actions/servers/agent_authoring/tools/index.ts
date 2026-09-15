import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  AGENT_AUTHORING_TOOLS_METADATA,
  CREATE_AGENT_TOOL_NAME,
  DELETE_AGENT_TOOL_NAME,
} from "@app/lib/api/actions/servers/agent_authoring/metadata";
import { createAgentHandler } from "@app/lib/api/actions/servers/agent_authoring/tools/create_agent";
import { deleteAgentHandler } from "@app/lib/api/actions/servers/agent_authoring/tools/delete_agent";

const handlers: ToolHandlers<typeof AGENT_AUTHORING_TOOLS_METADATA> = {
  [CREATE_AGENT_TOOL_NAME]: createAgentHandler,
  [DELETE_AGENT_TOOL_NAME]: deleteAgentHandler,
};

export const TOOLS = buildTools(AGENT_AUTHORING_TOOLS_METADATA, handlers);
