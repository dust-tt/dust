import { runMCPDiagnostics } from "@app/lib/api/poke/mcp_diagnostics";
import { createPlugin } from "@app/lib/api/poke/types";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export const diagnoseMcpServerViewPlugin = createPlugin({
  manifest: {
    id: "diagnose-mcp-server-view",
    name: "Diagnose MCP Server View",
    description:
      "Run diagnostic checks on this MCP server view: connection rows, OAuth token health, connect/listTools, and sync path. Returns detailed per-step errors without exposing tokens.",
    resourceTypes: ["mcp_server_views"],
    readonly: true,
    args: {
      userId: {
        type: "enum",
        label: "User",
        description:
          "Optional. Search by name or email to run personal OAuth checks on personal_actions servers.",
        values: [
          {
            label: "None (workspace checks only)",
            value: "",
            checked: true,
          },
        ],
        multiple: false,
        serverSideSearch: true,
      },
    },
  },
  isApplicableTo: (_auth, resource) => {
    return !!resource;
  },
  execute: async (auth, mcpServerView, args) => {
    if (!mcpServerView) {
      return new Err(new Error("MCP server view not found."));
    }

    const workspace = auth.getNonNullableWorkspace();
    const selectedUserId = args.userId?.[0]?.trim();
    const userId = selectedUserId || undefined;

    try {
      const report = await runMCPDiagnostics(auth, {
        workspaceId: workspace.sId,
        mcpServerId: mcpServerView.mcpServerId,
        serverViewId: mcpServerView.sId,
        userId,
      });

      return new Ok({
        display: "json",
        value: report,
      });
    } catch (error) {
      return new Err(new Error(normalizeError(error).message));
    }
  },
});
