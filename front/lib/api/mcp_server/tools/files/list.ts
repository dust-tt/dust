import { registerDustMcpTool } from "@app/lib/api/mcp_server/tools/register";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mcpError, mcpJsonResponse } from "../response";
import { getDustFileSystemForScope, scopedPrefixForScope } from "./context";
import { formatFileListOutput } from "./list_output";
import { FILES_SCOPE_SCHEMA } from "./schemas";

const inputSchema = {
  scope: FILES_SCOPE_SCHEMA.describe(
    'File system scope: `{ type: "conversation", conversation_id: "..." }` or `{ type: "pod", pod_id: "..." }`.'
  ),
};

export function registerFilesListTool(server: McpServer) {
  registerDustMcpTool(
    server,
    "files_list",
    {
      description:
        "List files in the Dust file system. Returns scoped paths (e.g. `conversation-<id>/chart.png`, `pod-<id>/spec.md`), content types, and sizes. " +
        "Some files have a `*.processed.<ext>` sibling with extracted text or transcripts for binary sources. " +
        "Requires an explicit conversation_id or pod_id.",
      inputSchema,
    },
    async (auth, { scope }) => {
      const fsResult = await getDustFileSystemForScope(auth, scope);
      if (fsResult.isErr()) {
        return mcpError(fsResult.error);
      }

      const textResult = await formatFileListOutput(
        auth,
        fsResult.value,
        scopedPrefixForScope(scope)
      );
      if (textResult.isErr()) {
        return mcpError("Failed to list files.");
      }

      return mcpJsonResponse({ text: textResult.value });
    }
  );
}
