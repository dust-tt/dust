import type { ToolContext } from "@app/lib/actions/types";
import { EXPORT_INTERACTIVE_CONTENT_FILE_TOOL_NAME } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { createInteractiveContentTools } from "@app/lib/api/actions/servers/interactive_content/tools";
import type { Authenticator } from "@app/lib/auth";

const ALLOWED_TOOL_NAMES = new Set<string>([
  EXPORT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
]);

/**
 * @cc [owner:flvndvd,label:product] frames-v2-tool-allowlist
 * Frames v2 MUST expose only explicitly allowlisted supplemental tools. Frame creation,
 * editing, and publishing MUST remain unavailable through this MCP server.
 */
export async function createInteractiveContentV2Tools(
  auth: Authenticator,
  toolContext?: ToolContext
) {
  const legacyTools = await createInteractiveContentTools(auth, toolContext);
  return legacyTools.filter((tool) => ALLOWED_TOOL_NAMES.has(tool.name));
}
