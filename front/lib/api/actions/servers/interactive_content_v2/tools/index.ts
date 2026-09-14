import type { ToolContext } from "@app/lib/actions/types";
import { PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { createInteractiveContentTools } from "@app/lib/api/actions/servers/interactive_content/tools";
import type { Authenticator } from "@app/lib/auth";

export async function createInteractiveContentV2Tools(
  auth: Authenticator,
  toolContext?: ToolContext
) {
  const legacyTools = await createInteractiveContentTools(auth, toolContext);
  // Migrate capabilities progressively: dsbx owns publishing, while the legacy server keeps
  // serving operations that do not have a Frames v2 replacement yet.
  return legacyTools.filter(
    (tool) => tool.name !== PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME
  );
}
