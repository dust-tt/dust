import type { MCPServerOAuthFormValues } from "@app/components/actions/mcp/forms/types";
import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata_extraction";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { CellInfo } from "@app/types/cell";
import { setupOAuthConnection } from "@app/types/oauth/client/setup";
import type { OAuthProvider } from "@app/types/oauth/lib";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";

interface CreateMCPServerConnectionParams {
  connectionId: string;
  mcpServerId: string;
  mcpServerDisplayName: string;
  provider: OAuthProvider;
}

// Returns the response body on success or null on error (error handling is done internally via notifications).
type CreateMCPServerConnectionFn = (
  args: CreateMCPServerConnectionParams
) => Promise<unknown>;

interface UpdateMCPServerViewParams {
  oAuthUseCase: NonNullable<MCPServerOAuthFormValues["useCase"]>;
  oauthScope?: string;
}

// Returns true on success, false on error (error handling is done internally via notifications).
type UpdateMCPServerViewFn = (
  data: UpdateMCPServerViewParams
) => Promise<boolean>;

interface SubmitConnectMCPServerDialogFormParams {
  owner: WorkspaceType;
  mcpServerView: MCPServerViewType;
  authorization: AuthorizationInfo;
  values: MCPServerOAuthFormValues;
  createMCPServerConnection: CreateMCPServerConnectionFn;
  updateServerView: UpdateMCPServerViewFn;
  onBeforeAssociateConnection: () => void;
  cellInfo: CellInfo | null;
}

export async function submitConnectMCPServerDialogForm({
  owner,
  mcpServerView,
  authorization,
  values,
  createMCPServerConnection,
  updateServerView,
  onBeforeAssociateConnection,
  cellInfo,
}: SubmitConnectMCPServerDialogFormParams): Promise<Result<null, Error>> {
  if (!values.useCase) {
    return new Err(new Error("Use case is null while trying to connect"));
  }

  const scope = authorization.scope;

  // Step 1: Setup OAuth connection
  const connectionResult = await setupOAuthConnection({
    owner,
    provider: authorization.provider,
    // During setup, the use case is always "platform_actions".
    useCase: "platform_actions",
    extraConfig: {
      ...(values.authCredentials ?? {}),
      ...(scope ? { scope } : {}),
    },
    cellInfo,
  });

  if (connectionResult.isErr()) {
    return new Err(connectionResult.error);
  }

  onBeforeAssociateConnection();

  // Step 2: Associate connection with MCP server.
  // Error handling for this step is done internally by the hook via notifications.
  await createMCPServerConnection({
    connectionId: connectionResult.value.connection_id,
    mcpServerId: mcpServerView.server.sId,
    mcpServerDisplayName: getMcpServerDisplayName(mcpServerView.server),
    provider: authorization.provider,
  });

  // Step 3: Update the oAuthUseCase for the MCP server view, pinning the scope this connection was
  // authorized for. Personal connections read their scope from the view, so this bounds members to
  // what the admin just consented to instead of letting them follow the server metadata as it grows.
  // Error handling for this step is done internally by the hook via notifications.
  await updateServerView({
    oAuthUseCase: values.useCase,
    ...(scope ? { oauthScope: scope } : {}),
  });

  return new Ok(null);
}
