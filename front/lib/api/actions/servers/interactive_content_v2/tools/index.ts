import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { ToolContext } from "@app/lib/actions/types";
import {
  CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  EXPORT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
} from "@app/lib/api/actions/servers/interactive_content/metadata";
import { createInteractiveContentTools } from "@app/lib/api/actions/servers/interactive_content/tools";
import { INTERACTIVE_CONTENT_V2_TOOLS_METADATA } from "@app/lib/api/actions/servers/interactive_content_v2/metadata";
import type { Authenticator } from "@app/lib/auth";
import assert from "assert";

// Legacy tools served unchanged under Frames v2.
const ALLOWED_LEGACY_TOOL_NAMES = new Set<string>([
  EXPORT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
]);

/**
 * @cc [owner:flvndvd,label:product] frames-v2-tool-allowlist
 * Frames v2 MUST expose only its own tools (`INTERACTIVE_CONTENT_V2_TOOLS_METADATA`: Frame
 * creation from a template) and explicitly allowlisted legacy tools. Inline Frame creation,
 * editing, and publishing MUST remain unavailable through this MCP server.
 */
export async function createInteractiveContentV2Tools(
  auth: Authenticator,
  toolContext?: ToolContext
): Promise<ToolDefinition[]> {
  const legacyTools = await createInteractiveContentTools(auth, toolContext);
  const legacyCreateTool = legacyTools.find(
    (tool) => tool.name === CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME
  );
  assert(legacyCreateTool, "Expected the legacy create tool.");

  const handlers: ToolHandlers<typeof INTERACTIVE_CONTENT_V2_TOOLS_METADATA> = {
    create_interactive_content_file: (params, extra) =>
      legacyCreateTool.handler({ ...params, mode: "template" }, extra),
  };

  return [
    ...buildTools(INTERACTIVE_CONTENT_V2_TOOLS_METADATA, handlers),
    ...legacyTools.filter((tool) => ALLOWED_LEGACY_TOOL_NAMES.has(tool.name)),
  ];
}
