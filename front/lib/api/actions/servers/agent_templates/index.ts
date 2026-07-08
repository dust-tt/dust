import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContextType } from "@app/lib/actions/types";
import {
  AGENT_TEMPLATES_SERVER_NAME,
  AGENT_TEMPLATES_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/agent_templates/metadata";
import {
  formatTemplatesAsText,
  getTemplatesForSidekick,
} from "@app/lib/api/assistant/sidekick_templates";
import type { Authenticator } from "@app/lib/auth";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { isJobType } from "@app/types/job_type";
import { Err, Ok } from "@app/types/shared/result";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const handlers: ToolHandlers<typeof AGENT_TEMPLATES_TOOLS_METADATA> = {
  search_agent_templates: async ({ jobType, query }, { auth }) => {
    const res = await getTemplatesForSidekick({
      auth,
      jobType: jobType && isJobType(jobType) ? jobType : undefined,
      query,
      limit: 10,
    });
    if (res.isErr()) {
      return new Err(new MCPError(res.error.message, { tracked: false }));
    }
    return new Ok([{ type: "text" as const, text: formatTemplatesAsText(res.value) }]);
  },

  get_agent_template: async ({ templateId }) => {
    const template = await TemplateResource.fetchByExternalId(templateId);
    if (!template) {
      return new Err(
        new MCPError(`Template not found: ${templateId}`, { tracked: false })
      );
    }
    return new Ok([{ type: "text" as const, text: formatTemplatesAsText([template]) }]);
  },
};

const TOOLS = buildTools(AGENT_TEMPLATES_TOOLS_METADATA, handlers);

function createServer(auth: Authenticator, toolContext?: ToolContextType): McpServer {
  const server = makeInternalMCPServer(AGENT_TEMPLATES_SERVER_NAME);
  for (const tool of TOOLS) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: AGENT_TEMPLATES_SERVER_NAME,
    });
  }
  return server;
}

export default createServer;
