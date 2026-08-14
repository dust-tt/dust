import url from "node:url";
import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icons";
import { DEFAULT_MCP_ACTION_DESCRIPTION } from "@app/lib/actions/constants";
import { remoteMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { MCPToolType, RemoteMCPServerType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { toGlobalResponse, untrustedFetch } from "@app/lib/egress/server";
import { DustError } from "@app/lib/error";
import { MCPServerConnectionModel } from "@app/lib/models/agent/actions/mcp_server_connection";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { RemoteMCPServerModel } from "@app/lib/models/agent/actions/remote_mcp_server";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/agent/actions/remote_mcp_server_tool_metadata";
import { BaseResource } from "@app/lib/resources/base_resource";
import { destroyMCPServerViewDependencies } from "@app/lib/resources/mcp_server_view_helper";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import {
  getResourceIdFromSId,
  isResourceSId,
} from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { mcpToolsRequireConfiguration } from "@app/lib/utils/json_schemas";
import logger from "@app/logger/logger";
import type { MCPOAuthConnectionMetadataType } from "@app/types/api/oauth/providers/mcp";
import type { MCPOAuthUseCase } from "@app/types/oauth/lib";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import { redactString } from "@app/types/shared/utils/string_utils";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import {
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
  registerClient,
  selectClientAuthMethod,
  selectResourceURL,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  AuthorizationServerMetadata,
  OAuthProtectedResourceMetadata,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

const SECRET_REDACTION_COOLDOWN_IN_MINUTES = 10;

export function getMCPAuthorizationScope({
  extraScopes,
  resourceScopes,
  authorizationServerScopes,
}: {
  extraScopes?: string;
  resourceScopes?: string[];
  authorizationServerScopes?: string[];
}): string | undefined {
  const scopes = new Set(
    extraScopes?.trim()
      ? extraScopes.trim().split(/\s+/)
      : (resourceScopes ?? authorizationServerScopes ?? [])
  );

  if (authorizationServerScopes?.includes("offline_access")) {
    scopes.add("offline_access");
  } else {
    scopes.delete("offline_access");
  }

  return scopes.size > 0 ? [...scopes].join(" ") : undefined;
}

// Unbounded columns (large JSONB/TEXT values) excluded from the base fetch. Callers opt into
// the ones they need via `includeHeavyAttributes`, or hydrate later via `hydrateHeavyAttributes`.
const REMOTE_MCP_SERVER_HEAVY_ATTRIBUTES = [
  "authorization",
  "cachedTools",
  "customHeaders",
  "lastError",
  "sharedSecret",
] as const;

export type RemoteMCPServerHeavyAttributeType =
  (typeof REMOTE_MCP_SERVER_HEAVY_ATTRIBUTES)[number];

type RemoteMCPServerHeavyAttributesType = Pick<
  Attributes<RemoteMCPServerModel>,
  RemoteMCPServerHeavyAttributeType
>;

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// Heavy attributes are not exposed directly: use their getters (`getCachedTools`, ...) after
// listing them in `includeHeavyAttributes` at fetch time (none are fetched by default) or
// after an explicit `hydrateHeavyAttributes`.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface RemoteMCPServerResource
  extends Omit<
    ReadonlyAttributesType<RemoteMCPServerModel>,
    RemoteMCPServerHeavyAttributeType
  > {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class RemoteMCPServerResource extends BaseResource<RemoteMCPServerModel> {
  static model: ModelStatic<RemoteMCPServerModel> = RemoteMCPServerModel;

  // Only the keys fetched so far are present; a key mapped to `null` is a fetched NULL, an
  // absent key was never fetched.
  private heavyAttributes: Partial<RemoteMCPServerHeavyAttributesType>;

  constructor(
    model: ModelStatic<RemoteMCPServerModel>,
    blob: Attributes<RemoteMCPServerModel>
  ) {
    super(RemoteMCPServerModel, blob);
    // Rows fetched without a heavy attribute do not carry its key at all.
    this.heavyAttributes = {
      ...("authorization" in blob ? { authorization: blob.authorization } : {}),
      ...("cachedTools" in blob ? { cachedTools: blob.cachedTools } : {}),
      ...("customHeaders" in blob ? { customHeaders: blob.customHeaders } : {}),
      ...("lastError" in blob ? { lastError: blob.lastError } : {}),
      ...("sharedSecret" in blob ? { sharedSecret: blob.sharedSecret } : {}),
    };
  }

  private static missingHeavyAttributeMessage(
    key: RemoteMCPServerHeavyAttributeType
  ): string {
    return (
      `Remote MCP server \`${key}\` was not fetched — list it in ` +
      "`includeHeavyAttributes` or call `hydrateHeavyAttributes` first"
    );
  }

  getAuthorization(): RemoteMCPServerHeavyAttributesType["authorization"] {
    const { authorization } = this.heavyAttributes;
    assert(
      authorization !== undefined,
      RemoteMCPServerResource.missingHeavyAttributeMessage("authorization")
    );
    return authorization;
  }

  getCachedTools(): RemoteMCPServerHeavyAttributesType["cachedTools"] {
    const { cachedTools } = this.heavyAttributes;
    assert(
      cachedTools !== undefined,
      RemoteMCPServerResource.missingHeavyAttributeMessage("cachedTools")
    );
    return cachedTools;
  }

  getCustomHeaders(): RemoteMCPServerHeavyAttributesType["customHeaders"] {
    const { customHeaders } = this.heavyAttributes;
    assert(
      customHeaders !== undefined,
      RemoteMCPServerResource.missingHeavyAttributeMessage("customHeaders")
    );
    return customHeaders;
  }

  getLastError(): RemoteMCPServerHeavyAttributesType["lastError"] {
    const { lastError } = this.heavyAttributes;
    assert(
      lastError !== undefined,
      RemoteMCPServerResource.missingHeavyAttributeMessage("lastError")
    );
    return lastError;
  }

  getSharedSecret(): RemoteMCPServerHeavyAttributesType["sharedSecret"] {
    const { sharedSecret } = this.heavyAttributes;
    assert(
      sharedSecret !== undefined,
      RemoteMCPServerResource.missingHeavyAttributeMessage("sharedSecret")
    );
    return sharedSecret;
  }

  static async hydrateHeavyAttributes(
    auth: Authenticator,
    servers: RemoteMCPServerResource[],
    attributes: readonly RemoteMCPServerHeavyAttributeType[],
    transaction?: Transaction
  ): Promise<void> {
    const requested = new Set(attributes);
    const missing = servers.filter((s) =>
      attributes.some((key) => !(key in s.heavyAttributes))
    );
    if (missing.length === 0) {
      return;
    }
    const rows = await RemoteMCPServerModel.findAll({
      where: {
        id: { [Op.in]: missing.map((s) => s.id) },
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      attributes: ["id", ...attributes],
      transaction,
    });
    const rowById = new Map(rows.map((r) => [r.id, r]));
    for (const server of missing) {
      const row = rowById.get(server.id);
      if (!row) {
        // The server can be deleted between the base fetch and this one — leave its heavy
        // attributes unset rather than failing the whole batch.
        logger.warn(
          { remoteMCPServerId: server.id },
          "Remote MCP server row missing when hydrating heavy attributes"
        );
        continue;
      }
      server.heavyAttributes = {
        ...server.heavyAttributes,
        ...(requested.has("authorization")
          ? { authorization: row.authorization }
          : {}),
        ...(requested.has("cachedTools")
          ? { cachedTools: row.cachedTools }
          : {}),
        ...(requested.has("customHeaders")
          ? { customHeaders: row.customHeaders }
          : {}),
        ...(requested.has("lastError") ? { lastError: row.lastError } : {}),
        ...(requested.has("sharedSecret")
          ? { sharedSecret: row.sharedSecret }
          : {}),
      };
    }
  }

  static async makeNew(
    auth: Authenticator,
    blob: Omit<
      CreationAttributes<RemoteMCPServerModel>,
      | "name"
      | "description"
      | "spaceId"
      | "sId"
      | "lastSyncAt"
      | "cachedToolsRequireConfiguration"
    > & {
      oAuthUseCase: MCPOAuthUseCase | null;
      viewName?: string;
    },
    transaction?: Transaction
  ) {
    const canAdministrate =
      await SpaceResource.canAdministrateSystemSpace(auth);
    assert(
      canAdministrate,
      "The user is not authorized to create a remote MCP server"
    );

    const { oAuthUseCase, viewName, ...serverBlob } = blob;
    const serverData: CreationAttributes<RemoteMCPServerModel> = {
      ...serverBlob,
      sharedSecret: serverBlob.sharedSecret,
      lastSyncAt: new Date(),
      authorization: serverBlob.authorization,
      cachedToolsRequireConfiguration: mcpToolsRequireConfiguration(
        serverBlob.cachedTools
      ),
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
        oAuthUseCase,
        isRestrictedToSkills: false,
        ...(viewName ? { name: viewName } : {}),
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
    options?: ResourceFindOptions<RemoteMCPServerModel> & {
      includeHeavyAttributes?: readonly RemoteMCPServerHeavyAttributeType[];
    },
    transaction?: Transaction
  ) {
    const {
      where,
      includeHeavyAttributes = [],
      ...otherOptions
    } = options ?? {};

    const includedHeavyAttributes = new Set(includeHeavyAttributes);
    const excludedHeavyAttributes = REMOTE_MCP_SERVER_HEAVY_ATTRIBUTES.filter(
      (key) => !includedHeavyAttributes.has(key)
    );

    const servers = await RemoteMCPServerModel.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...(excludedHeavyAttributes.length > 0
        ? { attributes: { exclude: excludedHeavyAttributes } }
        : {}),
      ...otherOptions,
      transaction,
    });

    return servers.map(
      (server) => new this(RemoteMCPServerModel, server.get())
    );
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[],
    {
      includeHeavyAttributes,
    }: {
      includeHeavyAttributes?: readonly RemoteMCPServerHeavyAttributeType[];
    } = {}
  ): Promise<RemoteMCPServerResource[]> {
    return this.baseFetch(auth, {
      where: {
        id: removeNulls(ids.map(getResourceIdFromSId)),
      },
      includeHeavyAttributes,
    });
  }

  static async fetchById(
    auth: Authenticator,
    id: string,
    options: {
      includeHeavyAttributes?: readonly RemoteMCPServerHeavyAttributeType[];
    } = {}
  ): Promise<RemoteMCPServerResource | null> {
    const [server] = await this.fetchByIds(auth, [id], options);
    return server ?? null;
  }

  static async findByPk(
    auth: Authenticator,
    id: number,
    options?: ResourceFindOptions<RemoteMCPServerModel> & {
      includeHeavyAttributes?: readonly RemoteMCPServerHeavyAttributeType[];
    }
  ): Promise<RemoteMCPServerResource | null> {
    const servers = await this.baseFetch(auth, {
      where: {
        id,
      },
      ...options,
    });
    return servers.length > 0 ? servers[0] : null;
  }

  static async fetchByModelIds(
    auth: Authenticator,
    ids: ModelId[],
    {
      transaction,
      includeHeavyAttributes,
    }: {
      transaction?: Transaction;
      includeHeavyAttributes?: readonly RemoteMCPServerHeavyAttributeType[];
    } = {}
  ): Promise<RemoteMCPServerResource[]> {
    if (ids.length === 0) {
      return [];
    }
    return this.baseFetch(
      auth,
      {
        where: { id: { [Op.in]: ids } },
        includeHeavyAttributes,
      },
      transaction
    );
  }

  static async fetchBySIdsAsMap(
    auth: Authenticator,
    sIds: string[]
  ): Promise<Map<string, RemoteMCPServerResource>> {
    const remoteSIds = sIds.filter((sId) =>
      isResourceSId("remote_mcp_server", sId)
    );
    if (remoteSIds.length === 0) {
      return new Map();
    }
    const servers = await this.fetchByIds(auth, remoteSIds);
    return new Map(servers.map((server) => [server.sId, server]));
  }

  static async listByWorkspace(
    auth: Authenticator,
    {
      includeHeavyAttributes,
    }: {
      includeHeavyAttributes?: readonly RemoteMCPServerHeavyAttributeType[];
    } = {}
  ) {
    return this.baseFetch(auth, { includeHeavyAttributes });
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

    await destroyMCPServerViewDependencies(auth, {
      mcpServerViewIds: mcpServerViews.map((view) => view.id),
    });

    await RemoteMCPServerToolMetadataModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        remoteMCPServerId: this.id,
      },
    });

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
      meta,
      cachedName,
      cachedDescription,
      cachedTools,
      lastSyncAt,
      clearError,
    }: {
      icon?: CustomResourceIconType | InternalAllowedIconType;
      sharedSecret?: string;
      customHeaders?: Record<string, string>;
      meta?: Record<string, string> | null;
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
      meta,
      cachedName,
      cachedDescription,
      cachedTools,
      ...(cachedTools
        ? {
            cachedToolsRequireConfiguration:
              mcpToolsRequireConfiguration(cachedTools),
          }
        : {}),
      lastSyncAt,
      ...(clearError ? { lastError: null } : {}),
    });

    // The written values are now known regardless of what the original fetch included.
    this.heavyAttributes = {
      ...this.heavyAttributes,
      ...(sharedSecret !== undefined ? { sharedSecret } : {}),
      ...(customHeaders !== undefined ? { customHeaders } : {}),
      ...(cachedTools !== undefined ? { cachedTools } : {}),
      ...(clearError ? { lastError: null } : {}),
    };

    return new Ok(undefined);
  }

  async updateUrl(
    auth: Authenticator,
    newUrl: string
  ): Promise<Result<undefined, DustError<"unauthorized">>> {
    const canAdministrate =
      await SpaceResource.canAdministrateSystemSpace(auth);

    if (!canAdministrate) {
      return new Err(
        new DustError(
          "unauthorized",
          "The user is not authorized to update the URL of a remote MCP server"
        )
      );
    }

    await this.update({ url: newUrl });

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

    this.heavyAttributes = { ...this.heavyAttributes, lastError };
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

    const fetchFn: FetchLike = async (input, init?) => {
      // @ts-expect-error - globalThis.RequestInit and undici.RequestInit are structurally
      // compatible at runtime.
      const response = await untrustedFetch(String(input), {
        ...init,
        headers: {
          ...init?.headers,
          ...customHeaders,
        },
      });
      return toGlobalResponse(response);
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

    let resource: URL | undefined;
    try {
      resource = await selectResourceURL(
        serverUrl,
        provider,
        // we default to null, so swap it for undefined if not set
        resourceMetadata ?? undefined
      );
    } catch (e) {
      const error = normalizeError(e);
      logger.info(
        { error, serverUrl },
        "Failed to select OAuth protected resource URL"
      );
      return new Err(
        new DustError(
          "internal_error",
          `Failed to discover OAuth metadata for ${serverUrl}: ${error.message}`
        )
      );
    }

    let metadata: AuthorizationServerMetadata | undefined;
    try {
      metadata = await discoverAuthorizationServerMetadata(authServerUrl, {
        fetchFn,
      });
      if (!metadata) {
        return new Err(
          new DustError("internal_error", "Failed to discover OAuth metadata")
        );
      }
    } catch (e) {
      logger.info(
        { error: e, serverUrl },
        "Failed to discover authorization server metadata"
      );
      return new Err(
        new DustError("internal_error", "Failed to discover OAuth metadata")
      );
    }
    //const parsedMetadata = await OAuthMetadataSchema.parseAsync(metadata);

    // Dynamic client registration
    const clientMetadata = provider.clientMetadata;

    clientMetadata.scope = getMCPAuthorizationScope({
      extraScopes,
      resourceScopes: resourceMetadata?.scopes_supported,
      authorizationServerScopes: metadata.scopes_supported,
    });

    try {
      // Try DCR.
      const fullInformation = await registerClient(serverUrl, {
        metadata,
        clientMetadata,
        fetchFn,
      });

      const tokenEndpointAuthMethod = selectClientAuthMethod(
        fullInformation,
        metadata.token_endpoint_auth_methods_supported ?? []
      );

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
    } catch (e) {
      // Servers that don't advertise a registration_endpoint don't support DCR at all — the
      // failure isn't a broken registration attempt, it's expected, and Static OAuth is the
      // right path.
      const message = metadata.registration_endpoint
        ? "Failed to register client, this server might require a pre-approval process. Please contact support@dust.com."
        : "This server does not support automatic OAuth setup (no dynamic client registration " +
          "endpoint). Please use Static OAuth with the client ID/secret provided by the " +
          "server's OAuth application.";
      logger.error({ error: e }, message);
      return new Err(new DustError("internal_error", message));
    }
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
    meta: Record<string, string> | null;
  } {
    const sharedSecretValue = this.getSharedSecret();
    const customHeadersValue = this.getCustomHeaders();

    const currentTime = new Date();
    const createdAt = new Date(this.createdAt);
    const timeDifference = Math.abs(
      currentTime.getTime() - createdAt.getTime()
    );
    const differenceInMinutes = Math.ceil(timeDifference / (1000 * 60));
    const shouldRedact =
      differenceInMinutes > SECRET_REDACTION_COOLDOWN_IN_MINUTES;

    const secret = sharedSecretValue
      ? shouldRedact
        ? redactString(sharedSecretValue, 4)
        : sharedSecretValue
      : null;

    const headers =
      customHeadersValue && shouldRedact
        ? Object.fromEntries(
            Object.entries(customHeadersValue).map(([key, value]) => [
              key,
              value !== null && value !== undefined
                ? redactString(String(value), 4)
                : value,
            ])
          )
        : customHeadersValue;

    return {
      sId: this.sId,

      name: this.cachedName,
      description: this.cachedDescription ?? DEFAULT_MCP_ACTION_DESCRIPTION,
      version: this.version,
      icon: this.icon,
      tools: this.getCachedTools(),

      authorization: this.getAuthorization(),
      availability: "manual",
      allowMultipleInstances: true,

      // Remote MCP Server specifics
      url: this.url,
      lastSyncAt: this.lastSyncAt?.getTime() ?? null,
      lastError: this.getLastError(),
      sharedSecret: secret,
      customHeaders: headers,
      meta: this.meta,
      documentationUrl: null,
    };
  }
}
