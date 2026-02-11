import type { CreateMCPServerDialogFormValues } from "@app/components/actions/mcp/forms/types";
import { requiresBearerTokenConfiguration } from "@app/lib/actions/mcp_helper";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata_extraction";
import type { MCPServerType } from "@app/lib/api/mcp";
import type { MCPConnectionType } from "@app/lib/swr/mcp_servers";
import type { CreateMCPServerResponseBody } from "@app/pages/api/w/[wId]/mcp";
import type { DiscoverOAuthMetadataResponseBody } from "@app/pages/api/w/[wId]/mcp/discover_oauth_metadata";
import { setupOAuthConnection } from "@app/types/oauth/client/setup";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { sanitizeHeadersArray } from "@app/types/shared/utils/http_headers";
import type { WorkspaceType } from "@app/types/user";

export type CreateMCPServerDialogSubmitResult =
  | {
      type: "oauth_required";
      authorization: AuthorizationInfo;
      authCredentials: CreateMCPServerDialogFormValues["authCredentials"];
      remoteMCPServerOAuthDiscoveryDone: boolean;
    }
  | {
      type: "server_created";
      server: MCPServerType;
      remoteMCPServerOAuthDiscoveryDone: boolean;
    };

export type CreateMCPServerDialogSubmitErrorKind =
  | "discover_oauth_metadata"
  | "missing_use_case"
  | "oauth_connection"
  | "create_server";

export class CreateMCPServerDialogSubmitError extends Error {
  readonly kind: CreateMCPServerDialogSubmitErrorKind;
  readonly remoteMCPServerOAuthDiscoveryDone: boolean;

  constructor({
    kind,
    message,
    remoteMCPServerOAuthDiscoveryDone,
  }: {
    kind: CreateMCPServerDialogSubmitErrorKind;
    message: string;
    remoteMCPServerOAuthDiscoveryDone: boolean;
  }) {
    super(message);
    this.kind = kind;
    this.remoteMCPServerOAuthDiscoveryDone = remoteMCPServerOAuthDiscoveryDone;
  }
}

type DiscoverOAuthMetadataFn = (
  url: string,
  customHeaders?: { key: string; value: string }[]
) => Promise<Result<DiscoverOAuthMetadataResponseBody, Error>>;

type CreateRemoteMCPServerFn = (args: {
  url: string;
  includeGlobal: boolean;
  sharedSecret?: string;
  oauthConnection?: MCPConnectionType;
  customHeaders?: { key: string; value: string }[];
}) => Promise<Result<CreateMCPServerResponseBody, Error>>;

type CreateInternalMCPServerFn = (args: {
  name: string;
  oauthConnection?: MCPConnectionType;
  includeGlobal: boolean;
  sharedSecret?: string;
  customHeaders?: Array<{ key: string; value: string }>;
}) => Promise<Result<CreateMCPServerResponseBody, Error>>;

interface SubmitCreateMCPServerDialogFormParams {
  owner: WorkspaceType;
  internalMCPServer?: MCPServerType;
  values: CreateMCPServerDialogFormValues;
  // Workflow state - managed via useState in the dialog, not in form state.
  // These are server-derived values, not user input.
  authorization: AuthorizationInfo | null;
  remoteMCPServerOAuthDiscoveryDone: boolean;
  discoverOAuthMetadata: DiscoverOAuthMetadataFn;
  createWithURL: CreateRemoteMCPServerFn;
  createInternalMCPServer: CreateInternalMCPServerFn;
  onBeforeCreateServer: () => void;
}

export async function submitCreateMCPServerDialogForm({
  owner,
  internalMCPServer,
  values,
  authorization,
  remoteMCPServerOAuthDiscoveryDone,
  discoverOAuthMetadata,
  createWithURL,
  createInternalMCPServer,
  onBeforeCreateServer,
}: SubmitCreateMCPServerDialogFormParams): Promise<
  Result<CreateMCPServerDialogSubmitResult, Error>
> {
  let oauthConnection: MCPConnectionType | undefined;
  let nextRemoteMCPServerOAuthDiscoveryDone = remoteMCPServerOAuthDiscoveryDone;

  if (values.remoteServerUrl) {
    // URL validation is handled by Zod schema
    if (
      values.authMethod === "oauth-dynamic" &&
      !remoteMCPServerOAuthDiscoveryDone
    ) {
      const discoverOAuthMetadataRes = await discoverOAuthMetadata(
        values.remoteServerUrl,
        values.useCustomHeaders
          ? sanitizeHeadersArray(values.customHeaders)
          : undefined
      );

      if (discoverOAuthMetadataRes.isOk()) {
        nextRemoteMCPServerOAuthDiscoveryDone = true;
        if (discoverOAuthMetadataRes.value.oauthRequired) {
          return new Ok({
            type: "oauth_required",
            authorization: {
              provider: "mcp",
              supported_use_cases: ["platform_actions", "personal_actions"],
            },
            authCredentials:
              discoverOAuthMetadataRes.value.connectionMetadata ?? null,
            remoteMCPServerOAuthDiscoveryDone:
              nextRemoteMCPServerOAuthDiscoveryDone,
          });
        }
      } else if (discoverOAuthMetadataRes.isErr()) {
        nextRemoteMCPServerOAuthDiscoveryDone = false;
        return new Err(
          new CreateMCPServerDialogSubmitError({
            kind: "discover_oauth_metadata",
            message: discoverOAuthMetadataRes.error.message,
            remoteMCPServerOAuthDiscoveryDone:
              nextRemoteMCPServerOAuthDiscoveryDone,
          })
        );
      }
    }
  }

  const oauthUseCase = values.useCase;

  if (authorization && !oauthUseCase) {
    return new Err(
      new CreateMCPServerDialogSubmitError({
        kind: "missing_use_case",
        message: "Please select a use case",
        remoteMCPServerOAuthDiscoveryDone:
          nextRemoteMCPServerOAuthDiscoveryDone,
      })
    );
  }

  if (authorization && oauthUseCase) {
    const scope = authorization.scope;

    const cRes = await setupOAuthConnection({
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

    if (cRes.isErr()) {
      return new Err(
        new CreateMCPServerDialogSubmitError({
          kind: "oauth_connection",
          message: cRes.error.message,
          remoteMCPServerOAuthDiscoveryDone:
            nextRemoteMCPServerOAuthDiscoveryDone,
        })
      );
    }

    oauthConnection = {
      useCase: oauthUseCase,
      connectionId: cRes.value.connection_id,
    };
  }

  onBeforeCreateServer();

  let server: MCPServerType | undefined;

  if (internalMCPServer) {
    const sanitizedHeaders =
      requiresBearerTokenConfiguration(internalMCPServer) &&
      values.useCustomHeaders
        ? sanitizeHeadersArray(values.customHeaders)
        : undefined;

    const createRes = await createInternalMCPServer({
      name: internalMCPServer.name,
      oauthConnection,
      includeGlobal: true,
      ...(requiresBearerTokenConfiguration(internalMCPServer) &&
      (values.sharedSecret !== undefined ||
        (sanitizedHeaders && sanitizedHeaders.length > 0))
        ? {
            sharedSecret: values.sharedSecret,
            customHeaders:
              sanitizedHeaders && sanitizedHeaders.length > 0
                ? sanitizedHeaders
                : undefined,
          }
        : {}),
    });

    if (createRes.isErr()) {
      return new Err(
        new CreateMCPServerDialogSubmitError({
          kind: "create_server",
          message: createRes.error.message,
          remoteMCPServerOAuthDiscoveryDone:
            nextRemoteMCPServerOAuthDiscoveryDone,
        })
      );
    }

    server = createRes.value.server;
  }

  if (values.remoteServerUrl) {
    const createRes = await createWithURL({
      url: values.remoteServerUrl,
      includeGlobal: true,
      sharedSecret:
        values.authMethod === "bearer" ? values.sharedSecret : undefined,
      oauthConnection,
      customHeaders: values.useCustomHeaders
        ? sanitizeHeadersArray(values.customHeaders)
        : undefined,
    });

    if (createRes.isErr()) {
      return new Err(
        new CreateMCPServerDialogSubmitError({
          kind: "create_server",
          message: createRes.error.message,
          remoteMCPServerOAuthDiscoveryDone:
            nextRemoteMCPServerOAuthDiscoveryDone,
        })
      );
    }
    server = createRes.value.server;
  }

  if (!server) {
    return new Err(
      new CreateMCPServerDialogSubmitError({
        kind: "create_server",
        message: "Failed to create MCP server",
        remoteMCPServerOAuthDiscoveryDone:
          nextRemoteMCPServerOAuthDiscoveryDone,
      })
    );
  }

  return new Ok({
    type: "server_created",
    server,
    remoteMCPServerOAuthDiscoveryDone: nextRemoteMCPServerOAuthDiscoveryDone,
  });
}
