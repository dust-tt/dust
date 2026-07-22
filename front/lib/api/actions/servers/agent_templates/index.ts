import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AGENT_TEMPLATES_TOOLS_METADATA } from "@app/lib/api/actions/servers/agent_templates/metadata";
import {
  formatTemplatesAsText,
  getTemplatesForSidekick,
} from "@app/lib/api/assistant/sidekick_templates";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { isJobType } from "@app/types/job_type";
import { Err, Ok } from "@app/types/shared/result";

export const AGENT_TEMPLATES_TOOL_HANDLERS: ToolHandlers<
  typeof AGENT_TEMPLATES_TOOLS_METADATA
> = {
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
    return new Ok([
      { type: "text" as const, text: formatTemplatesAsText(res.value) },
    ]);
  },

  get_agent_template: async ({ templateId }) => {
    const template = await TemplateResource.fetchByExternalId(templateId);
    if (!template) {
      return new Err(
        new MCPError(`Template not found: ${templateId}`, { tracked: false })
      );
    }
    return new Ok([
      { type: "text" as const, text: formatTemplatesAsText([template]) },
    ]);
  },
};
