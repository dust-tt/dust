import type { MCPServerOAuthFormValues } from "@app/components/actions/mcp/forms/types";
import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata_extraction";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { Result, WorkspaceType } from "@app/types";
import { Err, Ok, setupOAuthConnection } from "@app/types";
import type { OAuthProvider } from "@app/types/oauth/lib";

interface CreateMCPServerConnectionParams {
  connectionId?: string;
  credentialId?: string;
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
  hasGoogleDriveWriteFeature: boolean;
}

export async function submitConnectMCPServerDialogForm({
  owner,
  mcpServerView,
  authorization,
  values,
  createMCPServerConnection,
  updateServerView,
  onBeforeAssociateConnection,
  hasGoogleDriveWriteFeature,
}: SubmitConnectMCPServerDialogFormParams): Promise<Result<null, Error>> {
  if (!values.useCase) {
    return new Err(new Error("Use case is null while trying to connect"));
  }

  const isKeyPairAuth = values.connectionAuthMethod === "keypair";

  if (isKeyPairAuth) {
    // Key pair authentication flow
    if (!values.keyPairCredentials) {
      return new Err(new Error("Key pair credentials are required"));
    }

    // Step 1: Store credentials via the credentials API.
    // eslint-disable-next-line no-restricted-globals
    const credentialsResponse = await fetch(`/api/w/${owner.sId}/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: "snowflake",
        credentials: values.keyPairCredentials,
      }),
    });

    if (!credentialsResponse.ok) {
      const errorText = await credentialsResponse.text();
      return new Err(
        new Error(`Failed to store credentials: ${errorText}`)
      );
    }

    const credentialsData = await credentialsResponse.json();
    const credentialId = credentialsData.credentials?.id;

    if (!credentialId) {
      return new Err(new Error("Failed to get credential ID from response"));
    }

    onBeforeAssociateConnection();

    // Step 2: Associate credentials with MCP server.
    await createMCPServerConnection({
      credentialId,
      mcpServerId: mcpServerView.server.sId,
      mcpServerDisplayName: getMcpServerDisplayName(mcpServerView.server),
      provider: authorization.provider,
    });

    // Step 3: Update the oAuthUseCase for the MCP server view.
    // For key pair auth, always use platform_actions.
    await updateServerView({
      oAuthUseCase: "platform_actions",
    });

    return new Ok(null);
  }

  // OAuth authentication flow (existing behavior)

  // Check if this is google_drive and if write feature is enabled
  const isGoogleDrive = authorization.provider === "google_drive";

  const scope =
    isGoogleDrive && hasGoogleDriveWriteFeature
      ? "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly"
      : authorization.scope;

  // Step 1: Setup OAuth connection
  const connectionResult = await setupOAuthConnection({
    dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
    owner,
    provider: authorization.provider,
    // During setup, the use case is always "platform_actions".
    useCase: "platform_actions",
    extraConfig: {
      ...(values.authCredentials ?? {}),
      ...(scope ? { scope } : {}),
    },
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

  // Step 3: Update the oAuthUseCase for the MCP server view.
  // Error handling for this step is done internally by the hook via notifications.
  await updateServerView({
    oAuthUseCase: values.useCase,
  });

  return new Ok(null);
}
