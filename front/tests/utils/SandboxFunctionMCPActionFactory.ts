import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { Authenticator } from "@app/lib/auth";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";

export class SandboxFunctionMCPActionFactory {
  static async create(
    auth: Authenticator,
    {
      invocation,
      mcpServerView,
      toolName = "math_operation",
      inputs = { expression: "2+2" },
      status = "running",
      permission = "never_ask",
    }: {
      invocation: SandboxFunctionInvocationResource;
      mcpServerView: MCPServerViewResource;
      toolName?: string;
      inputs?: Record<string, unknown>;
      status?: "running" | "blocked_validation_required";
      permission?: MCPToolStakeLevelType;
    }
  ): Promise<SandboxFunctionMCPActionResource> {
    const serverName = mcpServerView.toJSON().server.name;

    // Minimal synthesized snapshot, mirroring what creation derives from the view + manifest.
    const toolConfiguration: LightMCPToolConfigurationType = {
      id: -1,
      sId: generateRandomModelSId(),
      type: "mcp_configuration",
      name: toolName,
      originalName: toolName,
      mcpServerName: serverName,
      dataSources: null,
      tables: null,
      childAgentId: null,
      timeFrame: null,
      jsonSchema: null,
      additionalConfiguration: {},
      mcpServerViewId: mcpServerView.sId,
      dustAppConfiguration: null,
      internalMCPServerId: null,
      secretName: null,
      dustProject: null,
      availability: "manual",
      permission,
      toolServerId: mcpServerView.mcpServerId,
      retryPolicy: "no_retry",
    };

    return SandboxFunctionMCPActionResource.makeNew(auth, {
      invocation,
      mcpServerView,
      toolName,
      inputs,
      toolConfiguration,
      status,
    });
  }
}
