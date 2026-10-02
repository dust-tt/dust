import type { ToolDefinition } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { ToolContext } from "@app/lib/actions/types";
import {
  CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  EXPORT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
} from "@app/lib/api/actions/servers/interactive_content/metadata";
import { createInteractiveContentTools } from "@app/lib/api/actions/servers/interactive_content/tools";
import type { Authenticator } from "@app/lib/auth";
import { z } from "zod";

// The create tool is exposed in its template-only variant, see `makeTemplateOnlyCreateTool`.
const ALLOWED_TOOL_NAMES = new Set<string>([
  CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  EXPORT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
]);

const TEMPLATE_CREATION_DESCRIPTION =
  "Create a new Frame from an existing template, copied server-side without reading or " +
  "regenerating its source. Use it only to instantiate a template: write any other new Frame " +
  "with the Computer and publish it with `dsbx frame publish`. The Frame is created as a legacy " +
  "Frame at `conversation-<conversationId>/<file_name>`: change it by editing that source file " +
  "in place, then publish it with `dsbx frame publish /files/conversation-<conversationId>/<file_name>`. " +
  "Never use this tool to replace a Frame that already exists.";

// Template-only variant of the legacy create tool: `mode` is fixed to "template", so `source`
// is always a template reference.
function makeTemplateOnlyCreateTool(
  createTool: ToolDefinition
): ToolDefinition {
  const { mode: _mode, ...schema } = createTool.schema;

  return {
    ...createTool,
    description: TEMPLATE_CREATION_DESCRIPTION,
    schema: {
      ...schema,
      source: z
        .string()
        .describe(
          "A reference to the template: a knowledge base node ID or a scoped file system path " +
            "(e.g. `pod-<id>/templates/my_template.tsx` or `conversation-<id>/my_template.tsx`). " +
            "Content is fetched server-side without consuming tokens."
        ),
    },
    handler: (params, extra) =>
      createTool.handler({ ...params, mode: "template" }, extra),
  };
}

/**
 * @cc [owner:flvndvd,label:product] frames-v2-tool-allowlist
 * Frames v2 MUST expose only explicitly allowlisted tools, with `create_interactive_content_file`
 * restricted to template mode. Inline Frame creation, editing, and publishing MUST remain
 * unavailable through this MCP server.
 */
export async function createInteractiveContentV2Tools(
  auth: Authenticator,
  toolContext?: ToolContext
): Promise<ToolDefinition[]> {
  const legacyTools = await createInteractiveContentTools(auth, toolContext);

  return legacyTools
    .filter((tool) => ALLOWED_TOOL_NAMES.has(tool.name))
    .map((tool) =>
      tool.name === CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME
        ? makeTemplateOnlyCreateTool(tool)
        : tool
    );
}
