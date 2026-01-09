import type { MCPServerOAuthFormValues } from "@app/components/actions/mcp/forms/types";
import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata_extraction";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { Result, WorkspaceType } from "@app/types";
import { Err, Ok, setupOAuthConnection } from "@app/types";
import type { OAuthProvider } from "@app/types/oauth/lib";

type CreateMCPServerConnectionFn = (args: {
  connectionId: string;
  mcpServerId: string;
  mcpServerDisplayName: string;
  provider: OAuthProvider;
}) => Promise<unknown>;

type UpdateMCPServerViewFn = (data: {
  oAuthUseCase: NonNullable<MCPServerOAuthFormValues["useCase"]>;
}) => Promise<unknown>;

export async function submitConnectMCPServerDialogForm({
  owner,
  mcpServerView,
  authorization,
  values,
  createMCPServerConnection,
  updateServerView,
  onBeforeAssociateConnection,
}: {
  owner: WorkspaceType;
  mcpServerView: MCPServerViewType;
  authorization: AuthorizationInfo;
  values: MCPServerOAuthFormValues;
  createMCPServerConnection: CreateMCPServerConnectionFn;
  updateServerView: UpdateMCPServerViewFn;
  onBeforeAssociateConnection: () => void;
}): Promise<Result<null, Error>> {
  if (!values.useCase) {
    return new Err(new Error("Use case is null while trying to connect"));
  }

  const cRes = await setupOAuthConnection({
    dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
    owner,
    provider: authorization.provider,
    // During setup, the use case is always "platform_actions".
    useCase: "platform_actions",
    extraConfig: {
      ...(values.authCredentials ?? {}),
      ...(authorization.scope ? { scope: authorization.scope } : {}),
    },
  });

  if (cRes.isErr()) {
    return new Err(cRes.error);
  }

  onBeforeAssociateConnection();

  // Then associate connection.
  await createMCPServerConnection({
    connectionId: cRes.value.connection_id,
    mcpServerId: mcpServerView.server.sId,
    mcpServerDisplayName: getMcpServerDisplayName(mcpServerView.server),
    provider: authorization.provider,
  });

  // And update the oAuthUseCase for the MCP server.
  await updateServerView({
    oAuthUseCase: values.useCase,
  });

  return new Ok(null);
}
