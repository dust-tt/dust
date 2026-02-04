import type { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";
import { isString } from "@app/types/shared/utils/general";

export type WorkspaceMCPServerAuthRefError =
  | {
      kind: "connection_not_found";
      message: string;
    }
  | {
      kind: "oauth_not_configured";
      message: string;
    }
  | {
      kind: "invalid_connection";
      message: string;
    };

export async function getWorkspaceOAuthConnectionIdForMCPServer(
  auth: Authenticator,
  mcpServerId: string
): Promise<Result<string, WorkspaceMCPServerAuthRefError>> {
  const connectionRes = await MCPServerConnectionResource.findByMCPServer(
    auth,
    {
      mcpServerId,
      connectionType: "workspace",
    }
  );

  if (connectionRes.isErr()) {
    return new Err({
      kind: "connection_not_found",
      message:
        "Failed to find MCP server connection: " + connectionRes.error.message,
    } satisfies WorkspaceMCPServerAuthRefError);
  }

  const hasAnyAuthRef =
    (isString(connectionRes.value.connectionId) &&
      connectionRes.value.connectionId !== "") ||
    (isString(connectionRes.value.credentialId) &&
      connectionRes.value.credentialId !== "");

  if (!hasAnyAuthRef) {
    return new Err({
      kind: "invalid_connection",
      message: "MCP server connection is invalid: missing auth reference.",
    } satisfies WorkspaceMCPServerAuthRefError);
  }

  const connectionId = connectionRes.value.connectionId;
  if (!isString(connectionId) || connectionId === "") {
    return new Err({
      kind: "oauth_not_configured",
      message: "Workspace MCP server connection is not configured for OAuth.",
    } satisfies WorkspaceMCPServerAuthRefError);
  }

  return new Ok(connectionId);
}
