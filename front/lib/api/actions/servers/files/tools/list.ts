import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { listGCSMountFiles } from "@app/lib/api/files/gcs_mount/files";
import { stripMimeParameters } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import partition from "lodash/partition";

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

  const [dirs, files] = partition(entries, (e) => e.isDirectory);

  if (dirs.length === 0 && files.length === 0) {
    return new Ok([{ type: "text", text: "No files available." }]);
  }

  const lines: string[] = [];

  for (const dir of dirs) {
    const hasChildren = files.some((f) => f.path.startsWith(`${dir.path}/`));
    if (!hasChildren) {
      lines.push(`${dir.path}/ [empty directory]`);
    }
  }

  for (const file of files) {
    const mimeType = stripMimeParameters(file.contentType);
    const kb = Math.ceil(file.sizeBytes / 1024);
    lines.push(`${file.path} (${mimeType}, ${kb} KB)`);
  }

  return new Ok([{ type: "text", text: lines.join("\n") }]);
}
