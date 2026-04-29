import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { listGCSMountFiles } from "@app/lib/api/files/gcs_mount/files";
import { stripMimeParameters } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";

export async function listHandler(
  _params: Record<string, never>,
  { auth, agentLoopContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const conversation = agentLoopContext?.runContext?.conversation;
  if (!conversation) {
    return new Err(new MCPError("No conversation context available."));
  }

  const entries = await listGCSMountFiles(auth, {
    useCase: "conversation",
    conversationId: conversation.sId,
  });

  const files = entries.filter((f) => !f.isDirectory);
  if (files.length === 0) {
    return new Ok([{ type: "text", text: "No files available." }]);
  }

  const lines = files.map((f) => {
    const mimeType = stripMimeParameters(f.contentType);
    const kb = Math.ceil(f.sizeBytes / 1024);
    return `${f.path} (${mimeType}, ${kb} KB)`;
  });

  return new Ok([{ type: "text", text: lines.join("\n") }]);
}
