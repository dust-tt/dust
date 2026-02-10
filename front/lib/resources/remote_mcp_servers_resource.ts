import url from "node:url";

import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import {
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
  registerClient,
  selectResourceURL,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthProtectedResourceMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icons";
import { DEFAULT_MCP_ACTION_DESCRIPTION } from "@app/lib/actions/constants";
import { remoteMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { MCPToolType, RemoteMCPServerType } from "@app/lib/api/mcp";
import type { MCPOAuthConnectionMetadataType } from "@app/lib/api/oauth/providers/mcp";
import type { Authenticator } from "@app/lib/auth";
import { untrustedFetch } from "@app/lib/egress/server";
import { DustError } from "@app/lib/error";
import { MCPServerConnectionModel } from "@app/lib/models/agent/actions/mcp_server_connection";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { destroyMCPServerViewDependencies } from "@app/lib/models/agent/actions/mcp_server_view_helper";
import { RemoteMCPServerModel } from "@app/lib/models/agent/actions/remote_mcp_server";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/agent/actions/remote_mcp_server_tool_metadata";
import { BaseResource } from "@app/lib/resources/base_resource";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { MCPOAuthUseCase, Result } from "@app/types";
import { Err, Ok, redactString, removeNulls } from "@app/types";

const SECRET_REDACTION_COOLDOWN_IN_MINUTES = 10;

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface RemoteMCPServerResource
  extends ReadonlyAttributesType<RemoteMCPServerModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class RemoteMCPServerResource extends BaseResource<RemoteMCPServerModel> {
  static model: ModelStatic<RemoteMCPServerModel> = RemoteMCPServerModel;

  constructor(
    model: ModelStatic<RemoteMCPServerModel>,
    blob: Attributes<RemoteMCPServerModel>
  ) {
    super(RemoteMCPServerModel, blob);
  }

  static async makeNew(
    auth: Authenticator,
    blob: Omit<
      CreationAttributes<RemoteMCPServerModel>,
      "name" | "description" | "spaceId" | "sId" | "lastSyncAt"
    > & {
      oAuthUseCase: MCPOAuthUseCase | null;
    },
    transaction?: Transaction
  ) {
    const canAdministrate =
      await SpaceResource.canAdministrateSystemSpace(auth);
    assert(
      canAdministrate,
      "The user is not authorized to create a remote MCP server"
    );

    const serverData: CreationAttributes<RemoteMCPServerModel> = {
      ...blob,
      sharedSecret: blob.sharedSecret,
      lastSyncAt: new Date(),
      authorization: blob.authorization,
    };

    const server = await RemoteMCPServerModel.create(serverData, {
      transaction,
    });

    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);

    // Immediately create a view for the server in the system space.
    await MCPServerViewModel.create(
      {
        workspaceId: auth.getNonNullableWorkspace().id,
        serverType: "remote",
        remoteMCPServerId: server.id,
        vaultId: systemSpace.id,
        editedAt: new Date(),
        editedByUserId: auth.user()?.id,
        oAuthUseCase: blob.oAuthUseCase,
      },
      {
        transaction,
      }
    );

    return new this(RemoteMCPServerModel, server.get());
  }

  // Fetching.

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<RemoteMCPServerModel>
  ) {
    const { where, ...otherOptions } = options ?? {};

    const servers = await RemoteMCPServerModel.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...otherOptions,
    });

    return servers.map(
      (server) => new this(RemoteMCPServerModel, server.get())
    );
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[]
  ): Promise<RemoteMCPServerResource[]> {
    return this.baseFetch(auth, {
      where: {
        id: removeNulls(ids.map(getResourceIdFromSId)),
      },
    });
  }

  static async fetchById(
    auth: Authenticator,
    id: string
  ): Promise<RemoteMCPServerResource | null> {
    const [server] = await this.fetchByIds(auth, [id]);
    return server ?? null;
  }

  static async findByPk(
    auth: Authenticator,
    id: number,
    options?: ResourceFindOptions<RemoteMCPServerModel>
  ): Promise<RemoteMCPServerResource | null> {
    const servers = await this.baseFetch(auth, {
      where: {
        id,
      },
      ...options,
    });
    return servers.length > 0 ? servers[0] : null;
  }

  static async listByWorkspace(auth: Authenticator) {
    return this.baseFetch(auth);
  }

  // Admin operations - don't use in non-temporal code.
  static async dangerouslyListAllServersIds({
    firstId,
    limit = 100,
  }: {
    firstId?: number;
    limit?: number;
  }) {
    const servers = await RemoteMCPServerModel.findAll({
      where: {
        id: {
          [Op.gte]: firstId,
        },
      },
      limit,
      order: [["id", "ASC"]],
    });

    return servers.map((server) => server.id);
  }

  // sId
  get sId(): string {
    return remoteMCPServerNameToSId({
      remoteMCPServerId: this.id,
      workspaceId: this.workspaceId,
    });
  }

  // Deletion.

  async delete(
    auth: Authenticator
  ): Promise<Result<undefined | number, DustError<"unauthorized">>> {
    const canAdministrate =
      await SpaceResource.canAdministrateSystemSpace(auth);

    if (!canAdministrate) {
      return new Err(
        new DustError(
          "unauthorized",
          "The user is not authorized to delete a remote MCP server"
        )
      );
    }

    const mcpServerViews = await MCPServerViewModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        remoteMCPServerId: this.id,
      },
    });

    await MCPServerConnectionModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        remoteMCPServerId: this.id,
      },
    });

    const serverToolMetadatas = await RemoteMCPServerToolMetadataModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        remoteMCPServerId: this.id,
      },
    });

    await concurrentExecutor(
      mcpServerViews,
      async (mcpServerView) => {
        await destroyMCPServerViewDependencies(auth, {
          mcpServerViewId: mcpServerView.id,
        });
      },
      { concurrency: 10 }
    );

    await concurrentExecutor(
      serverToolMetadatas,
      async (serverToolMetadata) => {
        await serverToolMetadata.destroy();
      },
      { concurrency: 10 }
    );

    // Directly delete the MCPServerView here to avoid a circular dependency.
    await MCPServerViewModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        remoteMCPServerId: this.id,
      },
      // Use 'hardDelete: true' to ensure the record is permanently deleted from the database,
      // bypassing the soft deletion in place.
      hardDelete: true,
    });

    const deletedCount = await RemoteMCPServerModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.id,
      },
    });

    return new Ok(deletedCount);
  }

  // Mutation.

  async updateMetadata(
    auth: Authenticator,
    {
      icon,
      sharedSecret,
      customHeaders,
      cachedName,
      cachedDescription,
      cachedTools,
      lastSyncAt,
      clearError,
    }: {
      icon?: CustomResourceIconType | InternalAllowedIconType;
      sharedSecret?: string;
      customHeaders?: Record<string, string>;
      cachedName?: string;
      cachedDescription?: string;
      cachedTools?: MCPToolType[];
      lastSyncAt: Date;
      clearError?: boolean;
    }
  ): Promise<Result<undefined, DustError<"unauthorized">>> {
    const canAdministrate =
      await SpaceResource.canAdministrateSystemSpace(auth);

    if (!canAdministrate) {
      return new Err(
        new DustError(
          "unauthorized",
          "The user is not authorized to update the metadata of a remote MCP server"
        )
      );
    }

    // If cachedTools is being updated, clean up tool metadata for tools that no longer exist
    if (cachedTools) {
      const cachedToolNames = new Set(cachedTools.map((tool) => tool.name));

      await RemoteMCPServerToolMetadataResource.deleteStaleTools(auth, {
        serverId: this.id,
        toolsToKeep: Array.from(cachedToolNames),
      });
    }

    await this.update({
      icon,
      sharedSecret,
      customHeaders,
      cachedName,
      cachedDescription,
      cachedTools,
      lastSyncAt,
      lastError: clearError ? null : this.lastError,
    });

    return new Ok(undefined);
  }

  async markAsErrored(
    auth: Authenticator,
    {
      lastError,
      lastSyncAt,
    }: {
      lastError: string;
      lastSyncAt: Date;
    }
  ) {
    const canAdministrate =
      await SpaceResource.canAdministrateSystemSpace(auth);
    if (!canAdministrate) {
      throw new DustError(
        "unauthorized",
        "The user is not authorized to mark a remote MCP server as errored"
      );
    }

    await this.update({
      lastError,
      lastSyncAt,
    });
  }

  static async discoverOAuthMetadata({
    serverUrl,
    provider,
    extraScopes,
    customHeaders,
  }: {
    serverUrl: string;
    provider: OAuthClientProvider;
    extraScopes?: string;
    customHeaders?: Record<string, string>;
  }): Promise<
    Result<MCPOAuthConnectionMetadataType, DustError<"internal_error">>
  > {
    // More or less copied from the official "MCP Inspector" code, but adapted to our needs.
    // Basically, we do the 2 first steps of the Guided Tour.
    // See: https://github.com/modelcontextprotocol/inspector/blob/c2dbff738e582941d6b1af04c4b9f41c28305487/client/src/lib/oauth-state-machine.ts#L31

    // @ts-expect-error - Typescript confusion over the Fetch types from node and elsewhere.
    const fetchFn: FetchLike = async (input, init?) => {
      // @ts-expect-error - Typescript confusion over the Fetch types from node and elsewhere.
      return untrustedFetch(input, {
        ...init,
        headers: {
          ...init?.headers,
          ...customHeaders,
        },
      });
    };

    // Default to discovering from the server's URL
    let authServerUrl = new URL("/", serverUrl);
    let resourceMetadata: OAuthProtectedResourceMetadata | null = null;
    try {
      resourceMetadata = await discoverOAuthProtectedResourceMetadata(
        serverUrl,
        undefined,
        fetchFn
      );
      if (resourceMetadata?.authorization_servers?.length) {
        authServerUrl = new URL(resourceMetadata.authorization_servers[0]);
      }
    } catch (e) {
      logger.info(
        { error: e },
        "Failed to discover OAuth protected resource metadata, continuing anyway"
      );
    }

    const resource: URL | undefined = await selectResourceURL(
      serverUrl,
      provider,
      // we default to null, so swap it for undefined if not set
      resourceMetadata ?? undefined
    );

    const metadata = await discoverAuthorizationServerMetadata(authServerUrl, {
      fetchFn,
    });
    if (!metadata) {
      return new Err(
        new DustError("internal_error", "Failed to discover OAuth metadata")
      );
    }
    //const parsedMetadata = await OAuthMetadataSchema.parseAsync(metadata);

    // Dynamic client registration
    const clientMetadata = provider.clientMetadata;

    // Priority: user-provided scope > discovered scopes
    if (!extraScopes || extraScopes.trim() === "") {
      // Prefer scopes from resource metadata if available
      const scopesSupported =
        resourceMetadata?.scopes_supported ?? metadata.scopes_supported;
      // Add all supported scopes to client registration
      if (scopesSupported) {
        clientMetadata.scope = scopesSupported.join(" ");
      }
    }

    // Try DCR.
    const fullInformation = await registerClient(serverUrl, {
      metadata,
      clientMetadata,
      fetchFn,
    });

    const supportedTokenAuthMethods =
      metadata.token_endpoint_auth_methods_supported;

    const tokenEndpointAuthMethod = supportedTokenAuthMethods?.includes(
      "client_secret_post"
    )
      ? "client_secret_post"
      : supportedTokenAuthMethods?.includes("client_secret_basic")
        ? "client_secret_basic"
        : undefined;

    const connectionMetadata: MCPOAuthConnectionMetadataType = {
      authorization_endpoint: metadata.authorization_endpoint,
      token_endpoint: metadata.token_endpoint,
      token_endpoint_auth_method: tokenEndpointAuthMethod,
      client_id: fullInformation.client_id,
      resource: resource
        ? url.format(resource, { fragment: false })
        : undefined,
      scope: clientMetadata.scope,
      client_secret: fullInformation.client_secret,
    };

    return new Ok(connectionMetadata);
  }

  // Serialization.
  toJSON(): Omit<
    RemoteMCPServerType,
    "url" | "lastSyncAt" | "lastError" | "sharedSecret"
  > & {
    // Remote MCP Server specifics

    url: string;
    lastSyncAt: number | null;
    lastError: string | null;
    sharedSecret: string | null;
    customHeaders: Record<string, string> | null;
  } {
    const currentTime = new Date();
    const createdAt = new Date(this.createdAt);
    const timeDifference = Math.abs(
      currentTime.getTime() - createdAt.getTime()
    );
    const differenceInMinutes = Math.ceil(timeDifference / (1000 * 60));
    const secret = this.sharedSecret
      ? differenceInMinutes > SECRET_REDACTION_COOLDOWN_IN_MINUTES
        ? redactString(this.sharedSecret, 4)
        : this.sharedSecret
      : null;

    return {
      sId: this.sId,

      name: this.cachedName,
      description: this.cachedDescription ?? DEFAULT_MCP_ACTION_DESCRIPTION,
      version: this.version,
      icon: this.icon,
      tools: this.cachedTools,

      authorization: this.authorization,
      availability: "manual",
      allowMultipleInstances: true,

      // Remote MCP Server specifics
      url: this.url,
      lastSyncAt: this.lastSyncAt?.getTime() ?? null,
      lastError: this.lastError,
      sharedSecret: secret,
      customHeaders: this.customHeaders,
      documentationUrl: null,
    };
  }
}
