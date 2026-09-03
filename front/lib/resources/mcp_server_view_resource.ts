import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icons";
import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { DEFAULT_MCP_ACTION_DESCRIPTION } from "@app/lib/actions/constants";
import {
  autoInternalMCPServerNameToSId,
  getMcpServerViewDisplayName,
  getServerTypeAndIdFromSId,
  remoteMCPServerNameToSId,
} from "@app/lib/actions/mcp_helper";
import type {
  AutoInternalMCPServerNameType,
  MCPServerAvailability,
} from "@app/lib/actions/mcp_internal_actions/constants";
import {
  AVAILABLE_INTERNAL_MCP_SERVER_NAMES,
  getAvailabilityOfInternalMCPServerById,
  getAvailabilityOfInternalMCPServerByName,
  getInternalMCPServerIconByName,
  getInternalMCPServerNameAndWorkspaceId,
  INTERNAL_MCP_SERVERS,
  isAutoInternalMCPServerName,
  isInternalMCPServerName,
  isValidInternalMCPServerId,
  matchesInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { tryGetPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import { isDeepDiveDisabledByAdmin } from "@app/lib/api/assistant/global_agents/configurations/dust/utils";
import type {
  MCPServerLightType,
  MCPServerType,
  MCPServerViewLightType,
  MCPServerViewNameConflictDetails,
  MCPServerViewType,
  MCPToolType,
} from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/agent/actions/remote_mcp_server_tool_metadata";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import {
  destroyAgentMCPServerConfigurationsForViews,
  destroyMCPServerViewDependencies,
} from "@app/lib/resources/mcp_server_view_helper";
import type { RemoteMCPServerHeavyAttributeType } from "@app/lib/resources/remote_mcp_servers_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { ResourceWithSpace } from "@app/lib/resources/resource_with_space";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticSoftDeletable } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type {
  InferIncludeType,
  ResourceFindOptions,
} from "@app/lib/resources/types";
import type { UserResource } from "@app/lib/resources/user_resource";
import { mcpToolsRequireConfiguration } from "@app/lib/utils/json_schemas";
import logger from "@app/logger/logger";
import { tracer } from "@app/logger/tracer";
import type { MCPOAuthUseCase } from "@app/types/oauth/lib";
import type { PlanType } from "@app/types/plan";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import { asDisplayToolName } from "@app/types/shared/utils/string_utils";
import {
  formatUserFullName,
  isWorkspaceAnalyticsEnabled,
} from "@app/types/user";
import assert from "assert";
import uniq from "lodash/uniq";
import type { Attributes, CreationAttributes, Transaction } from "sequelize";
import { Op } from "sequelize";
import { z } from "zod";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface MCPServerViewResource
  extends ReadonlyAttributesType<MCPServerViewModel> {}

type AffectedAgent = Pick<
  Attributes<AgentConfigurationModel>,
  "id" | "sId" | "name"
>;

type MCPServerViewCreationResult = {
  view: MCPServerViewResource;
  affectedAgents?: AffectedAgent[];
};

export type MCPServerViewDisplayMetadata = {
  serverType: "internal" | "remote";
  viewName: string | null;
  mcpServerId: string;
  serverName: string;
  icon: CustomResourceIconType | InternalAllowedIconType;
};

export type GetMCPServerViewsResponseBody = {
  success: boolean;
  serverViews: MCPServerViewType[];
};

export type PostMCPServerViewResponseBody = {
  success: boolean;
  serverView: MCPServerViewType;
};

const PostMCPServerViewQueryParamsSchema = z.object({
  mcpServerId: z.string(),
});

export type PostMCPServersQueryParams = z.infer<
  typeof PostMCPServerViewQueryParamsSchema
>;

// Per-process cache of workspaces whose auto internal MCP server views are known to be in
// sync, keyed by workspace ModelId. See `unsafeEnsureAutoViewsForWorkspace` for the
// invalidation story.
type HydratedWorkspaceEntry = {
  planCode: string;
  ensuredAtMs: number;
};
const hydratedWorkspaces = new Map<ModelId, HydratedWorkspaceEntry>();
const HYDRATED_WORKSPACES_CACHE_MAX_SIZE = 1_000_000;
const HYDRATION_TTL_MS = 30 * 60 * 1000;

// In-flight hydrations, so concurrent reads on the same pod share a single run instead of
// racing on the same checks and inserts.
const inflightHydrations = new Map<ModelId, Promise<void>>();

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MCPServerViewResource extends ResourceWithSpace<MCPServerViewModel> {
  static model: ModelStaticSoftDeletable<MCPServerViewModel> =
    MCPServerViewModel;
  declare readonly model: ModelStaticSoftDeletable<MCPServerViewModel>;
  readonly editedByUser?: Attributes<UserModel>;
  private internalToolsMetadata?: Attributes<RemoteMCPServerToolMetadataModel>[];
  private remoteToolsMetadata?: Attributes<RemoteMCPServerToolMetadataModel>[];
  private remoteMCPServer?: RemoteMCPServerResource;
  private internalMCPServer?: InternalMCPServerInMemoryResource;

  constructor(
    model: ModelStaticSoftDeletable<MCPServerViewModel>,
    blob: Attributes<MCPServerViewModel>,
    space: SpaceResource,
    includes?: Partial<InferIncludeType<MCPServerViewModel>>
  ) {
    super(model, blob, space);

    this.editedByUser = includes?.editedByUser;
    this.internalToolsMetadata = includes?.internalToolsMetadata;
    this.remoteToolsMetadata = includes?.remoteToolsMetadata;
  }

  private static async makeNew(
    auth: Authenticator,
    blob: Omit<
      CreationAttributes<MCPServerViewModel>,
      "editedAt" | "editedByUserId" | "vaultId" | "workspaceId"
    >,
    space: SpaceResource,
    editedByUser?: UserResource,
    transaction?: Transaction
  ) {
    assert(auth.isAdmin(), "Only the admin can create an MCP server view");

    if (blob.internalMCPServerId) {
      assert(
        isValidInternalMCPServerId(
          auth.getNonNullableWorkspace().id,
          blob.internalMCPServerId
        ),
        "Invalid internal MCP server ID"
      );
    }

    const server = await this.model.create(
      {
        ...blob,
        workspaceId: auth.getNonNullableWorkspace().id,
        editedByUserId: editedByUser?.id ?? null,
        editedAt: new Date(),
        vaultId: space.id,
      },
      { transaction }
    );

    const resource = new this(this.model, server.get(), space);

    if (blob.remoteMCPServerId) {
      const remoteServer = await RemoteMCPServerResource.findByPk(
        auth,
        blob.remoteMCPServerId,
        {
          includeHeavyAttributes: [
            "authorization",
            "cachedTools",
            "customHeaders",
            "lastError",
            "sharedSecret",
          ],
        }
      );
      if (!remoteServer) {
        throw new DustError(
          "remote_server_not_found",
          "Remote server not found after creation."
        );
      }
      resource.remoteMCPServer = remoteServer;
    } else if (blob.internalMCPServerId) {
      // Creation is gated upstream (createInternalMCPServer); resolve the server
      // even when restricted so an admin-installed view can still be built.
      const internalServer = await InternalMCPServerInMemoryResource.fetchById(
        auth,
        blob.internalMCPServerId,
        { includeRestricted: true }
      );
      if (!internalServer) {
        throw new DustError(
          "internal_server_not_found",
          "Internal server not found, it might have been deleted from the list of internal servers."
        );
      }
      resource.internalMCPServer = internalServer;
    }

    return resource;
  }

  /**
   * Check whether creating a view for `systemView` in `space` would conflict
   * with an existing view that resolves to the same effective name. We fetch
   * all views in the target space because different internalMCPServerIds can
   * actually point to the same MCP server and thus share the same display name.
   */
  static async hasNameConflictInSpace(
    auth: Authenticator,
    systemView: MCPServerViewResource,
    space: SpaceResource
  ): Promise<{
    hasConflict: boolean;
    name: string;
    conflictDetails: MCPServerViewNameConflictDetails | null;
  }> {
    const name = systemView.name ?? systemView.getServerDisplayMetadata().name;

    return this.hasNameConflictInSpaceByName(auth, name, space);
  }

  /**
   * Check whether the given name conflicts with an existing view in the target
   * space. When the candidate tools are known before creation, also compare the
   * model-facing names generated after the server-name prefix is truncated. On
   * conflict, `conflictDetails` names the existing view (and the shared
   * model-facing tool name for cropped-tool collisions) so callers can surface
   * what the new server collides with.
   */
  static async hasNameConflictInSpaceByName(
    auth: Authenticator,
    name: string,
    space: SpaceResource,
    tools: readonly MCPToolType[] = [],
    { excludedMCPServerViewId }: { excludedMCPServerViewId?: string } = {}
  ): Promise<{
    hasConflict: boolean;
    name: string;
    conflictDetails: MCPServerViewNameConflictDetails | null;
  }> {
    const candidateToolNames = removeNulls(
      tools.map((tool) => {
        const toolName = tryGetPrefixedToolName(name, tool.name);
        return toolName.isOk()
          ? { originalName: tool.name, prefixedName: toolName.value }
          : null;
      })
    );
    const existingViews = await this.listBySpace(auth, space);
    for (const view of existingViews) {
      if (view.sId === excludedMCPServerViewId) {
        continue;
      }

      const existingName = view.name ?? view.getServerDisplayMetadata().name;
      if (existingName === name) {
        return {
          hasConflict: true,
          name,
          conflictDetails: { conflictingServerName: existingName },
        };
      }

      // Use the candidate tool names for both prefixes: this check is about the
      // server-name crop and does not require loading existing tool payloads.
      for (const { originalName, prefixedName } of candidateToolNames) {
        const existingToolName = tryGetPrefixedToolName(
          existingName,
          originalName
        );
        if (
          existingToolName.isOk() &&
          existingToolName.value === prefixedName
        ) {
          return {
            hasConflict: true,
            name,
            conflictDetails: {
              conflictingServerName: existingName,
              conflictingToolName: prefixedName,
            },
          };
        }
      }
    }

    return { hasConflict: false, name, conflictDetails: null };
  }

  public static async create(
    auth: Authenticator,
    {
      systemView,
      space,
    }: {
      systemView: MCPServerViewResource;
      space: SpaceResource;
    }
  ): Promise<MCPServerViewCreationResult> {
    if (systemView.space.kind !== "system") {
      throw new Error(
        "You must pass the system view to create a new MCP server view"
      );
    }

    const mcpServerId = systemView.mcpServerId;
    const { serverType, id } = getServerTypeAndIdFromSId(mcpServerId);
    const blob = {
      serverType,
      internalMCPServerId: serverType === "internal" ? mcpServerId : null,
      remoteMCPServerId: serverType === "remote" ? id : null,
      // Always copy the oAuthUseCase, name, description and oauthScope from the
      // system view to the custom view so they're available without fetching the
      // system view (e.g. when resolving personal connection scopes).
      oAuthUseCase: systemView.oAuthUseCase,
      name: systemView.name,
      description: systemView.description,
      oauthScope: systemView.oauthScope,
      isRestrictedToSkills: false,
    };

    if (space.kind === "global") {
      const mcpServerViews = await this.listByMCPServer(auth, mcpServerId);
      const regularMCPServerViewModelIds = mcpServerViews
        .filter((view) => view.space.kind === "regular")
        .map((view) => view.id);
      const affectedAgents =
        await this.listLatestActiveAgentsToReconfigureOnGlobalShare(
          auth,
          regularMCPServerViewModelIds
        );
      for (const mcpServerView of mcpServerViews) {
        if (mcpServerView.space.kind === "regular") {
          await mcpServerView.delete(auth, { hardDelete: true });
        }
      }

      const view = await this.makeNew(
        auth,
        blob,
        space,
        auth.user() ?? undefined
      );

      return {
        view,
        affectedAgents,
      };
    }

    const view = await this.makeNew(
      auth,
      blob,
      space,
      auth.user() ?? undefined
    );

    return {
      view,
    };
  }

  private static async listLatestActiveAgentsToReconfigureOnGlobalShare(
    auth: Authenticator,
    regularMCPServerViewModelIds: ModelId[]
  ): Promise<AffectedAgent[]> {
    if (regularMCPServerViewModelIds.length === 0) {
      return [];
    }

    const workspaceModelId = auth.getNonNullableWorkspace().id;
    const impactedAgentConfigurations = await AgentConfigurationModel.findAll({
      where: {
        workspaceId: workspaceModelId,
      },
      include: [
        {
          model: AgentMCPServerConfigurationModel,
          as: "mcpServerConfigurations",
          required: true,
          where: {
            workspaceId: workspaceModelId,
            mcpServerViewId: {
              [Op.in]: regularMCPServerViewModelIds,
            },
          },
          attributes: [],
        },
      ],
      attributes: ["id", "sId"],
    });

    const impactedAgentModelIds = new Set(
      impactedAgentConfigurations.map((configuration) => configuration.id)
    );

    if (impactedAgentModelIds.size === 0) {
      return [];
    }

    const impactedAgentIds = uniq(
      impactedAgentConfigurations.map((configuration) => configuration.sId)
    );

    if (impactedAgentIds.length === 0) {
      return [];
    }

    const agentConfigurations = await AgentConfigurationModel.findAll({
      where: {
        workspaceId: workspaceModelId,
        sId: {
          [Op.in]: impactedAgentIds,
        },
      },
      attributes: ["id", "sId", "name", "status", "version"],
      order: [
        ["sId", "ASC"],
        ["version", "DESC"],
      ],
    });

    const latestAgentConfigurations = new Map<
      string,
      AgentConfigurationModel
    >();
    for (const agentConfiguration of agentConfigurations) {
      if (!latestAgentConfigurations.has(agentConfiguration.sId)) {
        latestAgentConfigurations.set(
          agentConfiguration.sId,
          agentConfiguration
        );
      }
    }

    return Array.from(latestAgentConfigurations.values())
      .filter(
        (agentConfiguration) =>
          impactedAgentModelIds.has(agentConfiguration.id) &&
          agentConfiguration.status === "active"
      )
      .map((agentConfiguration) => ({
        id: agentConfiguration.id,
        sId: agentConfiguration.sId,
        name: agentConfiguration.name,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  // Fetching.

  private static async baseFetch(
    auth: Authenticator,
    options: ResourceFindOptions<MCPServerViewModel> = {},
    {
      includeMetadata = true,
      includeHeavyAttributes,
      isRestrictedToSkills,
      includeRestricted = false,
      transaction,
    }: {
      includeMetadata?: boolean;
      includeHeavyAttributes?: readonly RemoteMCPServerHeavyAttributeType[];
      isRestrictedToSkills?: boolean;
      // Surface views whose internal server is gated behind a feature flag the
      // workspace does not have. Defaults to `false` so restricted servers are
      // not resolved into runnable tools; only admin management surfaces opt in.
      includeRestricted?: boolean;
      transaction?: Transaction;
    } = {}
  ) {
    const views = await this.baseFetchWithAuthorization(
      auth,
      {
        ...options,
        where: {
          ...options.where,
          ...(isRestrictedToSkills !== undefined
            ? { isRestrictedToSkills }
            : {}),
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        includes: [
          ...(options.includes ?? []),
          {
            model: UserModel,
            as: "editedByUser",
          },
        ],
      },
      transaction
    );

    const filteredViews: MCPServerViewResource[] = [];

    // If we are including deleted views, it's probably for the deletion activity.
    // We can just return the views and ignore the related mcp server state.
    if (options.includeDeleted) {
      filteredViews.push(...views);
    } else {
      const remoteServers = await RemoteMCPServerResource.fetchByModelIds(
        auth,
        removeNulls(views.map((v) => v.remoteMCPServerId)),
        { transaction, includeHeavyAttributes }
      );
      const remoteServerMap = new Map(remoteServers.map((s) => [s.id, s]));

      const internalServers =
        await InternalMCPServerInMemoryResource.fetchByIds(
          auth,
          removeNulls(views.map((v) => v.internalMCPServerId)),
          { includeRestricted }
        );
      const internalServerMap = new Map(internalServers.map((s) => [s.id, s]));

      for (const view of views) {
        if (view.remoteMCPServerId) {
          const remote = remoteServerMap.get(view.remoteMCPServerId);
          if (!remote) {
            continue;
          }
          view.remoteMCPServer = remote;
        } else if (view.internalMCPServerId) {
          const internal = internalServerMap.get(view.internalMCPServerId);
          if (!internal) {
            continue;
          }
          view.internalMCPServer = internal;
        } else {
          continue;
        }
        filteredViews.push(view);
      }
    }

    if (includeMetadata && filteredViews.length > 0) {
      await this.populateToolsMetadata(auth, filteredViews, transaction);
    }

    return filteredViews;
  }

  /**
   * Batch-fetch tool metadata for all views in one SQL query.
   */
  private static async populateToolsMetadata(
    auth: Authenticator,
    views: MCPServerViewResource[],
    transaction?: Transaction
  ): Promise<void> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const internalServerIds = removeNulls(
      views.map((v) => v.internalMCPServerId)
    );
    const remoteServerIds = removeNulls(views.map((v) => v.remoteMCPServerId));

    const internalMetadata =
      internalServerIds.length > 0
        ? await RemoteMCPServerToolMetadataModel.findAll({
            where: {
              workspaceId,
              internalMCPServerId: { [Op.in]: internalServerIds },
            },
            transaction,
          })
        : [];

    const remoteMetadata =
      remoteServerIds.length > 0
        ? await RemoteMCPServerToolMetadataModel.findAll({
            where: {
              workspaceId,
              remoteMCPServerId: { [Op.in]: remoteServerIds },
            },
            transaction,
          })
        : [];

    const metadataByInternalId = new Map<
      string,
      Attributes<RemoteMCPServerToolMetadataModel>[]
    >();
    for (const m of internalMetadata) {
      if (m.internalMCPServerId) {
        const list = metadataByInternalId.get(m.internalMCPServerId) ?? [];
        list.push(m.get());
        metadataByInternalId.set(m.internalMCPServerId, list);
      }
    }

    const metadataByRemoteId = new Map<
      ModelId,
      Attributes<RemoteMCPServerToolMetadataModel>[]
    >();
    for (const m of remoteMetadata) {
      if (m.remoteMCPServerId) {
        const list = metadataByRemoteId.get(m.remoteMCPServerId) ?? [];
        list.push(m.get());
        metadataByRemoteId.set(m.remoteMCPServerId, list);
      }
    }

    for (const view of views) {
      if (view.internalMCPServerId) {
        view.internalToolsMetadata =
          metadataByInternalId.get(view.internalMCPServerId) ?? [];
      }
      if (view.remoteMCPServerId) {
        view.remoteToolsMetadata =
          metadataByRemoteId.get(view.remoteMCPServerId) ?? [];
      }
    }
  }

  static async fetchById(
    auth: Authenticator,
    id: string,
    options?: ResourceFindOptions<MCPServerViewModel> & {
      includeHeavyAttributes?: readonly RemoteMCPServerHeavyAttributeType[];
      isRestrictedToSkills?: boolean;
      includeRestricted?: boolean;
    }
  ): Promise<MCPServerViewResource | null> {
    const [mcpServerView] = await this.fetchByIds(auth, [id], options);

    return mcpServerView ?? null;
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[],
    options?: ResourceFindOptions<MCPServerViewModel> & {
      includeHeavyAttributes?: readonly RemoteMCPServerHeavyAttributeType[];
      isRestrictedToSkills?: boolean;
      includeRestricted?: boolean;
    }
  ): Promise<MCPServerViewResource[]> {
    const viewModelIds = removeNulls(ids.map((id) => getResourceIdFromSId(id)));
    const {
      includeHeavyAttributes,
      isRestrictedToSkills,
      includeRestricted,
      ...findOptions
    } = options ?? {};

    const views = await this.baseFetch(
      auth,
      {
        ...findOptions,
        where: {
          ...findOptions.where,
          id: {
            [Op.in]: viewModelIds,
          },
        },
      },
      { includeHeavyAttributes, isRestrictedToSkills, includeRestricted }
    );

    return views ?? [];
  }

  static async fetchByModelPk(auth: Authenticator, id: ModelId) {
    const views = await this.fetchByModelIds(auth, [id]);

    if (views.length !== 1) {
      return null;
    }

    return views[0];
  }

  static async fetchByModelIds(
    auth: Authenticator,
    ids: ModelId[],
    {
      includeMetadata = true,
      includeHeavyAttributes,
      transaction,
    }: {
      includeMetadata?: boolean;
      includeHeavyAttributes?: readonly RemoteMCPServerHeavyAttributeType[];
      transaction?: Transaction;
    } = {}
  ) {
    const views = await this.baseFetch(
      auth,
      {
        where: {
          id: {
            [Op.in]: ids,
          },
        },
      },
      { includeMetadata, includeHeavyAttributes, transaction }
    );

    return views ?? [];
  }

  static async listByWorkspace(
    auth: Authenticator,
    options?: ResourceFindOptions<MCPServerViewModel> & {
      includeHeavyAttributes?: readonly RemoteMCPServerHeavyAttributeType[];
    }
  ): Promise<MCPServerViewResource[]> {
    const { includeHeavyAttributes, ...findOptions } = options ?? {};
    return this.baseFetch(auth, findOptions, { includeHeavyAttributes });
  }

  static async listDisplayMetadataByWorkspace(
    auth: Authenticator
  ): Promise<MCPServerViewDisplayMetadata[]> {
    const views = await this.baseFetchWithAuthorization(auth, {
      attributes: [
        "id",
        "workspaceId",
        "vaultId",
        "serverType",
        "name",
        "internalMCPServerId",
        "remoteMCPServerId",
      ],
      where: { workspaceId: auth.getNonNullableWorkspace().id },
    });

    const remoteServerModelIds = [
      ...new Set(removeNulls(views.map((view) => view.remoteMCPServerId))),
    ];
    const remoteServers = await RemoteMCPServerResource.fetchByModelIds(
      auth,
      remoteServerModelIds
    );
    const remoteServersById = new Map(
      remoteServers.map((server) => [server.id, server])
    );

    return removeNulls(
      views.map((view): MCPServerViewDisplayMetadata | null => {
        if (view.serverType === "remote" && view.remoteMCPServerId) {
          const server = remoteServersById.get(view.remoteMCPServerId);
          return server
            ? {
                serverType: view.serverType,
                viewName: view.name,
                mcpServerId: server.sId,
                serverName: server.cachedName,
                icon: server.icon,
              }
            : null;
        }

        if (view.serverType === "internal" && view.internalMCPServerId) {
          const server = getInternalMCPServerNameAndWorkspaceId(
            view.internalMCPServerId
          );
          if (server.isErr()) {
            return null;
          }
          const { serverInfo } =
            INTERNAL_MCP_SERVERS[server.value.name].metadata;
          return {
            serverType: view.serverType,
            viewName: view.name,
            mcpServerId: view.internalMCPServerId,
            serverName: serverInfo.name,
            icon: serverInfo.icon,
          };
        }

        return null;
      })
    );
  }

  static async resolveDisplayMetadataByNames(
    auth: Authenticator,
    names: string[]
  ) {
    const uniqueNames = [...new Set(names)];
    const metadata = new Map<
      string,
      {
        name: string;
        icon: CustomResourceIconType | InternalAllowedIconType;
      }
    >();

    for (const name of uniqueNames) {
      if (isInternalMCPServerName(name)) {
        metadata.set(name, {
          name: asDisplayToolName(name),
          icon: getInternalMCPServerIconByName(name),
        });
      }
    }

    const remoteNames = uniqueNames.filter(
      (name) => !isInternalMCPServerName(name)
    );
    if (remoteNames.length === 0) {
      return metadata;
    }

    const remoteServers = await RemoteMCPServerResource.fetchByNames(
      auth,
      remoteNames
    );

    for (const server of remoteServers) {
      metadata.set(server.cachedName, {
        name: server.cachedName,
        icon: server.icon,
      });
    }

    return metadata;
  }

  static async listBySpaces(
    auth: Authenticator,
    spaces: SpaceResource[],
    options?: ResourceFindOptions<MCPServerViewModel> & {
      includeHeavyAttributes?: readonly RemoteMCPServerHeavyAttributeType[];
      isRestrictedToSkills?: boolean;
    }
  ): Promise<MCPServerViewResource[]> {
    // Filter out spaces that the user does not have read or administrate access to
    const accessibleSpaces = spaces.filter(
      (space) => auth.can("read", space) || auth.can("admin", space)
    );
    if (accessibleSpaces.length === 0) {
      return [];
    }
    const { includeHeavyAttributes, isRestrictedToSkills, ...findOptions } =
      options ?? {};
    return this.baseFetch(
      auth,
      {
        ...findOptions,
        where: {
          ...findOptions.where,
          workspaceId: auth.getNonNullableWorkspace().id,
          vaultId: accessibleSpaces.map((s) => s.id),
        },
        order: [["id", "ASC"]],
      },
      { includeHeavyAttributes, isRestrictedToSkills }
    );
  }

  static async listBySpaceIds(
    auth: Authenticator,
    spaceIds: string[],
    {
      includeGlobalSpace = false,
      includeHeavyAttributes,
      isRestrictedToSkills,
    }: {
      includeGlobalSpace?: boolean;
      includeHeavyAttributes?: readonly RemoteMCPServerHeavyAttributeType[];
      isRestrictedToSkills?: boolean;
    } = {}
  ): Promise<MCPServerViewResource[]> {
    const spaceModelIds = removeNulls(spaceIds.map(getResourceIdFromSId));

    if (spaceModelIds.length === 0 && !includeGlobalSpace) {
      return [];
    }

    const views = await this.baseFetch(
      auth,
      {
        includes: [
          {
            model: SpaceResource.model,
            as: "space",
            attributes: [],
            required: true,
            where: {
              workspaceId: auth.getNonNullableWorkspace().id,
              deletedAt: null,
              [Op.or]: [
                { id: { [Op.in]: spaceModelIds } },
                ...(includeGlobalSpace ? [{ kind: "global" }] : []),
              ],
            },
          },
        ],
        order: [["id", "ASC"]],
      },
      { includeHeavyAttributes, isRestrictedToSkills }
    );

    // Permission parity with listBySpaces: the canReadOrAdministrate pre-filter on fetched
    // spaces becomes a post-filter on the space hydrated by baseFetchWithAuthorization.
    return views.filter((view) => view.canReadOrAdministrate(auth));
  }

  static async listBySpace(
    auth: Authenticator,
    space: SpaceResource,
    options?: ResourceFindOptions<MCPServerViewModel> & {
      includeHeavyAttributes?: readonly RemoteMCPServerHeavyAttributeType[];
      isRestrictedToSkills?: boolean;
    }
  ): Promise<MCPServerViewResource[]> {
    return this.listBySpaces(auth, [space], options);
  }

  // Hydrating variants of the list methods, for surfaces that enumerate the tools available
  // to a workspace and therefore need the auto internal MCP server views to exist (agent
  // builder, space tool listings, agent loop). They may write: missing auto views are
  // created just in time. Use the plain variants for reads that must not write (e.g.
  // deletion paths).

  static async listByWorkspaceEnsuringAutoViews(
    auth: Authenticator,
    options?: ResourceFindOptions<MCPServerViewModel>
  ): Promise<MCPServerViewResource[]> {
    await this.unsafeEnsureAutoViewsForWorkspace(auth);
    return this.listByWorkspace(auth, options);
  }

  static async listBySpacesEnsuringAutoViews(
    auth: Authenticator,
    spaces: SpaceResource[],
    options?: ResourceFindOptions<MCPServerViewModel> & {
      includeHeavyAttributes?: readonly RemoteMCPServerHeavyAttributeType[];
    }
  ): Promise<MCPServerViewResource[]> {
    await this.unsafeEnsureAutoViewsForWorkspace(auth);
    return this.listBySpaces(auth, spaces, options);
  }

  static async listBySpaceEnsuringAutoViews(
    auth: Authenticator,
    space: SpaceResource,
    options?: ResourceFindOptions<MCPServerViewModel> & {
      includeHeavyAttributes?: readonly RemoteMCPServerHeavyAttributeType[];
    }
  ): Promise<MCPServerViewResource[]> {
    return this.listBySpacesEnsuringAutoViews(auth, [space], options);
  }

  static async listBySpaceIdsEnsuringAutoViews(
    auth: Authenticator,
    spaceIds: string[],
    {
      includeGlobalSpace = false,
      includeHeavyAttributes,
      isRestrictedToSkills,
    }: {
      includeGlobalSpace?: boolean;
      includeHeavyAttributes?: readonly RemoteMCPServerHeavyAttributeType[];
      isRestrictedToSkills?: boolean;
    } = {}
  ): Promise<MCPServerViewResource[]> {
    await this.unsafeEnsureAutoViewsForWorkspace(auth);
    return this.listBySpaceIds(auth, spaceIds, {
      includeGlobalSpace,
      includeHeavyAttributes,
      isRestrictedToSkills,
    });
  }

  static async listForSystemSpace(
    auth: Authenticator,
    options?: ResourceFindOptions<MCPServerViewModel> & {
      includeHeavyAttributes?: readonly RemoteMCPServerHeavyAttributeType[];
      isRestrictedToSkills?: boolean;
    }
  ): Promise<MCPServerViewResource[]> {
    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);

    return this.listBySpace(auth, systemSpace, options);
  }

  static async listByMCPServers(
    auth: Authenticator,
    mcpServerIds: string[],
    {
      transaction,
      includeHeavyAttributes,
    }: {
      transaction?: Transaction;
      includeHeavyAttributes?: readonly RemoteMCPServerHeavyAttributeType[];
    } = {}
  ): Promise<MCPServerViewResource[]> {
    const serverTypesAndIds = mcpServerIds.map((mcpServerId) => ({
      ...getServerTypeAndIdFromSId(mcpServerId),
      mcpServerId,
    }));

    return this.baseFetch(
      auth,
      {
        where: {
          [Op.or]: [
            {
              serverType: "internal" as const,
              internalMCPServerId: {
                [Op.in]: serverTypesAndIds
                  .filter(({ serverType }) => serverType === "internal")
                  .map(({ mcpServerId }) => mcpServerId),
              },
            },
            {
              serverType: "remote",
              remoteMCPServerId: {
                [Op.in]: serverTypesAndIds
                  .filter(({ serverType }) => serverType === "remote")
                  .map(({ id }) => id),
              },
            },
          ],
        },
      },
      { transaction, includeHeavyAttributes }
    );
  }

  static async listByMCPServer(
    auth: Authenticator,
    mcpServerId: string,
    options: {
      transaction?: Transaction;
      includeHeavyAttributes?: readonly RemoteMCPServerHeavyAttributeType[];
    } = {}
  ): Promise<MCPServerViewResource[]> {
    return this.listByMCPServers(auth, [mcpServerId], options);
  }

  static async getByMCPServerAndSpace(
    auth: Authenticator,
    mcpServerId: string,
    space: SpaceResource
  ): Promise<MCPServerViewResource | null> {
    const { serverType, id } = getServerTypeAndIdFromSId(mcpServerId);
    const where =
      serverType === "internal"
        ? { serverType: "internal" as const, internalMCPServerId: mcpServerId }
        : { serverType: "remote" as const, remoteMCPServerId: id };

    const views = await this.baseFetch(auth, {
      where: { ...where, vaultId: space.id },
    });

    return views[0] ?? null;
  }

  // Auto internal MCP servers are supposed to be created in the global space; missing views
  // are created just in time (see unsafeEnsureAutoViewsForWorkspace). The result can still
  // be null when the server is restricted for the workspace (feature flag, plan).
  static async getMCPServerViewForAutoInternalTool(
    auth: Authenticator,
    name: AutoInternalMCPServerNameType
  ): Promise<MCPServerViewResource | null> {
    await this.unsafeEnsureAutoViewsForWorkspace(auth);
    const views = await this.listByMCPServer(
      auth,
      autoInternalMCPServerNameToSId({
        name,
        workspaceId: auth.getNonNullableWorkspace().id,
      })
    );

    return views.find((view) => view.space.kind === "global") ?? null;
  }

  static async getMCPServerViewsForAutoInternalTools(
    auth: Authenticator,
    names: AutoInternalMCPServerNameType[]
  ): Promise<MCPServerViewResource[]> {
    await this.unsafeEnsureAutoViewsForWorkspace(auth);
    const views = await this.listByMCPServers(
      auth,
      names.map((name) =>
        autoInternalMCPServerNameToSId({
          name,
          workspaceId: auth.getNonNullableWorkspace().id,
        })
      )
    );

    return views.filter((view) => view.space.kind === "global");
  }

  static async getMCPServerViewsForAutoInternalToolsAsMap<
    T extends AutoInternalMCPServerNameType,
  >(
    auth: Authenticator,
    names: readonly T[]
  ): Promise<Map<T, MCPServerViewResource>> {
    await this.unsafeEnsureAutoViewsForWorkspace(auth);
    const workspaceId = auth.getNonNullableWorkspace().id;
    const nameByInternalMCPServerId = new Map<string, T>(
      names.map((name) => [
        autoInternalMCPServerNameToSId({ name, workspaceId }),
        name,
      ])
    );

    const views = await this.listByMCPServers(auth, [
      ...nameByInternalMCPServerId.keys(),
    ]);

    const map = new Map<T, MCPServerViewResource>();
    for (const view of views) {
      if (view.space.kind !== "global" || !view.internalMCPServerId) {
        continue;
      }
      const name = nameByInternalMCPServerId.get(view.internalMCPServerId);
      if (name) {
        map.set(name, view);
      }
    }
    return map;
  }

  // Matches a view by display name from a pre-fetched list (callers fetch once to avoid an N+1).
  // System-space views are excluded since agents attach from global/regular spaces; when a server
  // is shared to several spaces the global-space view wins, otherwise the name must be unambiguous.
  static resolveAttachableByName(
    auth: Authenticator,
    views: MCPServerViewResource[],
    name: string
  ): Result<MCPServerViewResource, Error> {
    const matches = views.filter((view) => {
      if (
        view.space.kind === "system" ||
        (!auth.can("read", view.space) && !auth.can("admin", view.space))
      ) {
        return false;
      }
      return (view.name ?? view.getServerDisplayMetadata().name) === name;
    });

    if (matches.length === 0) {
      return new Err(new Error(`MCP server not found: ${name}`));
    }

    const globalMatches = matches.filter(
      (view) => view.space.kind === "global"
    );
    const candidates = globalMatches.length > 0 ? globalMatches : matches;
    if (candidates.length > 1) {
      return new Err(
        new Error(
          `Multiple MCP servers named "${name}" found; cannot resolve unambiguously.`
        )
      );
    }
    return new Ok(candidates[0]);
  }

  static async listMCPServerViewsAutoInternalForSpaces(
    auth: Authenticator,
    name: AutoInternalMCPServerNameType,
    spaceModelIds: ModelId[],
    transaction?: Transaction
  ) {
    const views = await this.listByMCPServer(
      auth,
      autoInternalMCPServerNameToSId({
        name,
        workspaceId: auth.getNonNullableWorkspace().id,
      }),
      { transaction }
    );

    // We include the global space, which is omitted from the requested space IDs of an agent.
    return views.filter(
      (view) =>
        spaceModelIds.includes(view.vaultId) || view.space.kind === "global"
    );
  }

  static async listSpaceRequirementsByIds(
    auth: Authenticator,
    mcpServerViewIds: string[]
  ): Promise<ModelId[]> {
    const mcpServerViews = await this.fetchByIds(auth, mcpServerViewIds);

    const spaceRequirements = mcpServerViews
      .filter((view) => {
        if (view.serverType !== "internal") {
          return true;
        }

        // We skip the permissions for auto internal tools as they are automatically available to all users.
        // This mimic the previous behavior of generic internal tools (search etc..).
        const availability = getAvailabilityOfInternalMCPServerById(
          view.mcpServerId
        );
        switch (availability) {
          case "auto":
          case "auto_hidden_builder":
            return false;
          case "manual":
            return true;
          default:
            assertNever(availability);
        }
      })
      .map((view) => view.space.id);

    return uniq(spaceRequirements);
  }

  static async getMCPServerViewForSystemSpace(
    auth: Authenticator,
    mcpServerId: string,
    {
      includeHeavyAttributes,
    }: {
      includeHeavyAttributes?: readonly RemoteMCPServerHeavyAttributeType[];
    } = {}
  ): Promise<MCPServerViewResource | null> {
    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
    const { serverType, id } = getServerTypeAndIdFromSId(mcpServerId);
    if (serverType === "internal") {
      const views = await this.baseFetch(auth, {
        where: {
          serverType: "internal",
          internalMCPServerId: mcpServerId,
          vaultId: systemSpace.id,
        },
      });
      return views[0] ?? null;
    } else {
      const views = await this.baseFetch(
        auth,
        {
          where: {
            serverType: "remote",
            remoteMCPServerId: id,
            vaultId: systemSpace.id,
          },
        },
        { includeHeavyAttributes }
      );
      return views[0] ?? null;
    }
  }

  static async getMCPServerViewForGlobalSpace(
    auth: Authenticator,
    mcpServerId: string
  ): Promise<MCPServerViewResource | null> {
    const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
    const { serverType, id } = getServerTypeAndIdFromSId(mcpServerId);
    if (serverType === "internal") {
      const views = await this.baseFetch(auth, {
        where: {
          serverType: "internal",
          internalMCPServerId: mcpServerId,
          vaultId: globalSpace.id,
        },
      });
      return views[0] ?? null;
    } else {
      const views = await this.baseFetch(auth, {
        where: {
          serverType: "remote",
          remoteMCPServerId: id,
          vaultId: globalSpace.id,
        },
      });
      return views[0] ?? null;
    }
  }

  public async updateOAuthUseCase(
    auth: Authenticator,
    oAuthUseCase: MCPOAuthUseCase,
    // Set on activation with the scope the admin just authorized. Personal connections read their
    // scope from the view, so this is what bounds members to the admin's consent.
    oauthScope?: string
  ): Promise<Result<number, DustError<"unauthorized">>> {
    if (!this.canAdministrate(auth)) {
      return new Err(
        new DustError("unauthorized", "Not allowed to update OAuth use case.")
      );
    }

    const [affectedCount] = await this.update({
      oAuthUseCase,
      ...(oauthScope !== undefined ? { oauthScope } : {}),
      editedAt: new Date(),
      editedByUserId: auth.getNonNullableUser().id,
    });
    return new Ok(affectedCount);
  }

  public async clearOAuthScope(
    auth: Authenticator
  ): Promise<Result<number, DustError<"unauthorized">>> {
    if (!this.canAdministrate(auth)) {
      return new Err(
        new DustError("unauthorized", "Not allowed to clear OAuth scope.")
      );
    }

    const [affectedCount] = await this.update({ oauthScope: null });
    return new Ok(affectedCount);
  }

  public async updateNameAndDescription(
    auth: Authenticator,
    name?: string,
    description?: string
  ): Promise<Result<number, DustError<"unauthorized">>> {
    if (!this.canAdministrate(auth)) {
      return new Err(
        new DustError(
          "unauthorized",
          "Not allowed to update name and description."
        )
      );
    }

    const [affectedCount] = await this.update({
      name,
      description,
      editedAt: new Date(),
      editedByUserId: auth.getNonNullableUser().id,
    });
    return new Ok(affectedCount);
  }

  public async updateIsRestrictedToSkills(
    auth: Authenticator,
    isRestrictedToSkills: boolean
  ): Promise<Result<number, DustError<"unauthorized">>> {
    const views = await MCPServerViewResource.listByMCPServer(
      auth,
      this.mcpServerId
    );

    if (views.some((view) => !view.canAdministrate(auth))) {
      return new Err(
        new DustError(
          "unauthorized",
          "Not allowed to update skill-only availability."
        )
      );
    }

    const [affectedCount] = await this.model.update(
      {
        isRestrictedToSkills,
        editedAt: new Date(),
        editedByUserId: auth.getNonNullableUser().id,
      },
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: { [Op.in]: views.map((view) => view.id) },
        },
      }
    );

    if (isRestrictedToSkills) {
      await destroyAgentMCPServerConfigurationsForViews(auth, {
        mcpServerViewIds: views.map((view) => view.id),
      });
    }

    return new Ok(affectedCount);
  }

  // Deletion.

  protected async softDelete(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<number, Error>> {
    assert(auth.isAdmin(), "Only the admin can delete an MCP server view");
    assert(
      auth.getNonNullableWorkspace().id === this.workspaceId,
      "Can only delete MCP server views for the current workspace"
    );

    const deletedCount = await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.id,
      },
      transaction,
      hardDelete: false,
    });

    return new Ok(deletedCount);
  }

  async hardDelete(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<number, Error>> {
    await destroyMCPServerViewDependencies(auth, {
      mcpServerViewIds: [this.id],
      transaction,
    });

    const deletedCount = await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.id,
      },
      transaction,
      // Use 'hardDelete: true' to ensure the record is permanently deleted from the database,
      // bypassing the soft deletion in place.
      hardDelete: true,
    });

    return new Ok(deletedCount);
  }

  private getRemoteMCPServerResource(): RemoteMCPServerResource {
    if (this.serverType !== "remote") {
      throw new Error("This MCP server view is not a remote server view");
    }

    if (!this.remoteMCPServerId) {
      throw new Error("This MCP server view is missing a remote server ID");
    }

    if (!this.remoteMCPServer) {
      throw new Error(
        "This MCP server view is referencing a non-existent remote server"
      );
    }

    return this.remoteMCPServer;
  }

  private getInternalMCPServerResource(): InternalMCPServerInMemoryResource {
    if (this.serverType !== "internal") {
      throw new Error("This MCP server view is not an internal server view");
    }

    if (!this.internalMCPServerId) {
      throw new Error("This MCP server view is missing an internal server ID");
    }

    if (!this.internalMCPServer) {
      throw new Error(
        "This MCP server view is referencing a non-existent internal server"
      );
    }

    return this.internalMCPServer;
  }

  /**
   * Server display metadata that is available without the remote server payload (no tools,
   * secrets or errors). Safe to use on views fetched without any heavy attributes.
   */
  getServerDisplayMetadata(): {
    name: string;
    description: string;
    icon: CustomResourceIconType | InternalAllowedIconType;
    meta: Record<string, string> | null;
    availability: MCPServerAvailability;
  } {
    switch (this.serverType) {
      case "remote": {
        const server = this.getRemoteMCPServerResource();
        return {
          name: server.cachedName,
          description:
            server.cachedDescription ?? DEFAULT_MCP_ACTION_DESCRIPTION,
          icon: server.icon,
          meta: server.meta,
          // Remote MCP servers are always manually installed (see
          // RemoteMCPServerResource.toJSON).
          availability: "manual",
        };
      }
      case "internal": {
        const server = this.getInternalMCPServerResource().toJSON();
        return {
          name: server.name,
          description: server.description,
          icon: server.icon,
          meta: server.meta ?? null,
          availability: server.availability,
        };
      }
      default:
        assertNever(this.serverType);
    }
  }

  /**
   * Returns the persisted tool definitions exposed by this server view. Remote views must have
   * been fetched with the cached tools heavy attribute.
   */
  getServerTools(): readonly MCPToolType[] {
    return this.serverType === "remote"
      ? this.getRemoteMCPServerResource().getCachedTools()
      : this.getInternalMCPServerResource().toJSON().tools;
  }

  /**
   * Server-side counterpart of `isJITMCPServerView`: true when the view's tools can be enabled
   * directly in a conversation. Cheap — remote servers carry the precomputed
   * `cachedToolsRequireConfiguration` flag, internal tools live in memory — so no heavy
   * attribute is needed at fetch time.
   */
  isJITAttachable(): boolean {
    if (matchesInternalMCPServerName(this.mcpServerId, "agent_memory")) {
      return false;
    }
    if (this.serverType === "remote") {
      return !this.getRemoteMCPServerResource().cachedToolsRequireConfiguration;
    }
    return !mcpToolsRequireConfiguration(
      this.getInternalMCPServerResource().toJSON().tools
    );
  }

  /**
   * The server's authorization config with the view's admin-configured scope restriction
   * applied. For remote servers this only needs the `authorization` heavy attribute.
   */
  getAuthorization(): MCPServerType["authorization"] {
    const authorization =
      this.serverType === "remote"
        ? this.getRemoteMCPServerResource().getAuthorization()
        : this.getInternalMCPServerResource().toJSON().authorization;
    if (this.oauthScope !== null && authorization) {
      return { ...authorization, scope: this.oauthScope };
    }
    return authorization;
  }

  /**
   * Display name resolution, available without the remote server heavy attributes.
   */
  getDisplayName(): string {
    return getMcpServerViewDisplayName({
      name: this.name,
      server: {
        sId: this.mcpServerId,
        name: this.getServerDisplayMetadata().name,
      },
    });
  }

  /**
   * JIT-hydrate the requested heavy attributes on the views' remote servers, e.g. before
   * serializing a filtered subset with `toJSON`.
   */
  static async hydrateRemoteServerHeavyAttributes(
    auth: Authenticator,
    views: MCPServerViewResource[],
    attributes: readonly RemoteMCPServerHeavyAttributeType[],
    transaction?: Transaction
  ): Promise<void> {
    await RemoteMCPServerResource.hydrateHeavyAttributes(
      auth,
      removeNulls(views.map((v) => v.remoteMCPServer ?? null)),
      attributes,
      transaction
    );
  }

  get sId(): string {
    return MCPServerViewResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  get mcpServerId(): string {
    if (this.serverType === "remote") {
      if (!this.remoteMCPServerId) {
        throw new Error("This MCP server view is missing a remote server ID");
      }

      return remoteMCPServerNameToSId({
        remoteMCPServerId: this.remoteMCPServerId,
        workspaceId: this.workspaceId,
      });
    } else if (this.serverType === "internal") {
      if (!this.internalMCPServerId) {
        throw new Error(
          "This MCP server view is missing an internal server ID"
        );
      }

      return this.internalMCPServerId;
    } else {
      assertNever(this.serverType);
    }
  }

  /**
   * Computes the sIds of the auto internal MCP servers enabled for the workspace. This is
   * the exact set of servers whose views must exist in the system and global spaces.
   */
  private static computeEnabledAutoInternalMCPServerIds(
    workspaceId: ModelId,
    {
      featureFlags,
      isDeepDiveDisabled,
      isWorkspaceAnalyticsEnabled,
      plan,
    }: {
      featureFlags: WhitelistableFeature[];
      isDeepDiveDisabled: boolean;
      isWorkspaceAnalyticsEnabled: boolean;
      plan: PlanType;
    }
  ): string[] {
    const autoInternalMCPServerIds: string[] = [];
    for (const name of AVAILABLE_INTERNAL_MCP_SERVER_NAMES) {
      if (!isAutoInternalMCPServerName(name)) {
        continue;
      }

      const isEnabled = !INTERNAL_MCP_SERVERS[name].isRestricted?.({
        featureFlags,
        isDeepDiveDisabled,
        isWorkspaceAnalyticsEnabled,
        plan,
      });
      const availability = getAvailabilityOfInternalMCPServerByName(name);

      if (isEnabled && availability !== "manual") {
        autoInternalMCPServerIds.push(
          autoInternalMCPServerNameToSId({
            name,
            workspaceId,
          })
        );
      }
    }
    return autoInternalMCPServerIds;
  }

  /**
   * Ensures the auto internal MCP server views of the workspace exist, creating any missing
   * ones. "unsafe" because creation escalates beyond the caller's role: reads from regular
   * members must hydrate too, so missing views are created on their behalf (views which only
   * admins can otherwise create).
   *
   * Guarded by a per-process cache so the steady-state cost is a Map lookup, zero reads. A
   * stale "hydrated" entry is harmless as long as the rows exist in the database (listings
   * read the rows directly), so each way the expected view set can change is covered without
   * cross-pod invalidation:
   * - registry change (new auto server): ships with a deploy, which restarts every pod and
   *   empties the cache;
   * - workspace feature-flag toggle: the mutation site creates the views synchronously (poke
   *   plugin and toggle_feature_flags script), so entries on other pods remain correct;
   * - plan change: the entry is keyed on the plan code, available in memory on the auth;
   * - global rollout percentage change: no per-workspace mutation site exists, so the entry
   *   TTL bounds the staleness (a pod re-checks a workspace at most every HYDRATION_TTL_MS).
   */
  static async unsafeEnsureAutoViewsForWorkspace(
    auth: Authenticator
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();
    const plan = auth.plan();
    if (!plan) {
      return;
    }

    const entry = hydratedWorkspaces.get(workspace.id);
    if (
      entry &&
      entry.planCode === plan.code &&
      Date.now() - entry.ensuredAtMs < HYDRATION_TTL_MS
    ) {
      return;
    }

    // Concurrent reads on the same pod share a single hydration.
    const inflight = inflightHydrations.get(workspace.id);
    if (inflight) {
      return inflight;
    }

    const hydration = (async () => {
      const { createdViewsCount, complete } =
        await this.ensureAllAutoToolsAreCreated(auth);

      if (createdViewsCount > 0) {
        logger.info(
          { workspaceId: workspace.sId, createdViewsCount },
          "Created missing auto MCP server views just in time"
        );
      }

      // Do not mark the workspace as hydrated when the run did not converge (default spaces
      // missing while the workspace is being created, or inserts swallowed by a non-target
      // unique constraint); the next read will retry.
      if (!complete) {
        return;
      }

      if (
        hydratedWorkspaces.size >= HYDRATED_WORKSPACES_CACHE_MAX_SIZE &&
        !hydratedWorkspaces.has(workspace.id)
      ) {
        // Evict the oldest inserted entry (Map preserves insertion order).
        const oldestWorkspaceModelId = hydratedWorkspaces.keys().next().value;
        if (oldestWorkspaceModelId !== undefined) {
          hydratedWorkspaces.delete(oldestWorkspaceModelId);
        }
      }
      hydratedWorkspaces.set(workspace.id, {
        planCode: plan.code,
        ensuredAtMs: Date.now(),
      });
    })().finally(() => {
      inflightHydrations.delete(workspace.id);
    });

    inflightHydrations.set(workspace.id, hydration);
    return hydration;
  }

  static async ensureAllAutoToolsAreCreated(auth: Authenticator): Promise<{
    createdViewsCount: number;
    complete: boolean;
  }> {
    return tracer.trace("ensureAllAutoToolsAreCreated", async () => {
      const workspace = auth.getNonNullableWorkspace();
      const plan = auth.getNonNullablePlan();

      const [featureFlags, isDeepDiveDisabled, spaces] = await Promise.all([
        getFeatureFlags(auth),
        isDeepDiveDisabledByAdmin(auth),
        SpaceResource.listWorkspaceDefaultSpaces(auth),
      ]);

      const autoInternalMCPServerIds =
        this.computeEnabledAutoInternalMCPServerIds(workspace.id, {
          featureFlags,
          isDeepDiveDisabled,
          isWorkspaceAnalyticsEnabled: isWorkspaceAnalyticsEnabled(workspace),
          plan,
        });

      if (autoInternalMCPServerIds.length === 0) {
        return { createdViewsCount: 0, complete: true };
      }

      const systemSpace = spaces.find((s) => s.isSystem());
      const globalSpace = spaces.find((s) => s.isGlobal());

      // Default spaces can be missing while the workspace is being created; skip instead of
      // failing the read that triggered the hydration. Workspace creation calls this
      // function again once the default spaces exist.
      if (!systemSpace || !globalSpace) {
        logger.warn(
          { workspaceId: workspace.sId },
          "ensureAllAutoToolsAreCreated: system or global space not found, skipping."
        );
        return { createdViewsCount: 0, complete: false };
      }

      // There should be a MCPServerView for these ids both in system and global spaces.
      const views = await this.model.findAll({
        where: {
          workspaceId: workspace.id,
          serverType: "internal",
          internalMCPServerId: {
            [Op.in]: autoInternalMCPServerIds,
          },
          vaultId: { [Op.in]: spaces.map((s) => s.id) },
        },
      });

      // Quick check: there should be 2 views for each auto internal MCP server
      // (enforced by a unique constraint), if already the case, no need to check further.
      if (views.length === autoInternalMCPServerIds.length * 2) {
        return { createdViewsCount: 0, complete: true };
      }

      const viewsByServerAndSpace = new Set(
        views.map((v) => `${v.internalMCPServerId}/${v.vaultId}`)
      );
      const systemViewByServerId = new Map(
        views
          .filter((v) => v.vaultId === systemSpace.id)
          .map((v) => [v.internalMCPServerId, v])
      );

      // editedByUserId is only meaningful when an admin triggers the creation (workspace
      // creation, feature-flag toggle); just-in-time hydration from a member read leaves it
      // null, the views are platform-created.
      const editedByUserId = auth.isAdmin() ? (auth.user()?.id ?? null) : null;

      // Unlike MCPServerViewResource.create, this does not clean up regular-space views of
      // the same server when creating the global view. That case is only reachable on a
      // manual -> auto availability transition, which the snapshot guard routes to the
      // dedicated migration script.
      const missingRows: CreationAttributes<MCPServerViewModel>[] = [];
      for (const id of autoInternalMCPServerIds) {
        // The global view inherits the customizable fields from the system view when one
        // already exists (same behavior as MCPServerViewResource.create).
        const systemView = systemViewByServerId.get(id);
        for (const space of [systemSpace, globalSpace]) {
          if (viewsByServerAndSpace.has(`${id}/${space.id}`)) {
            continue;
          }
          missingRows.push({
            workspaceId: workspace.id,
            serverType: "internal",
            internalMCPServerId: id,
            remoteMCPServerId: null,
            vaultId: space.id,
            editedAt: new Date(),
            editedByUserId,
            name: systemView?.name ?? null,
            description: systemView?.description ?? null,
            oAuthUseCase: systemView?.oAuthUseCase ?? null,
            oauthScope: systemView?.oauthScope ?? null,
            isRestrictedToSkills: false,
          });
        }
      }

      if (missingRows.length === 0) {
        return { createdViewsCount: 0, complete: true };
      }

      // Single INSERT for all missing views. Concurrent calls (e.g. two pods hydrating the
      // same workspace) can race on the inserts; ignoreDuplicates (ON CONFLICT DO NOTHING on
      // the unique constraint on workspaceId/internalMCPServerId/vaultId) makes the loser a
      // no-op.
      const createdViews = await this.model.bulkCreate(missingRows, {
        ignoreDuplicates: true,
      });

      // Rows that were not inserted come back without an id.
      const createdViewsCount = createdViews.filter((v) =>
        Number.isInteger(v.id)
      ).length;

      let complete = true;
      if (createdViewsCount < missingRows.length) {
        // ON CONFLICT DO NOTHING has no conflict target, so a shortfall is either a benign
        // race (a concurrent call inserted the same rows; they exist now) or a conflict on
        // another unique constraint (e.g. name uniqueness per space) that leaves a view
        // genuinely missing. Re-read to tell them apart; only the latter is an anomaly.
        const viewsAfterInsert = await this.model.findAll({
          where: {
            workspaceId: workspace.id,
            serverType: "internal",
            internalMCPServerId: {
              [Op.in]: autoInternalMCPServerIds,
            },
            vaultId: { [Op.in]: [systemSpace.id, globalSpace.id] },
          },
        });
        const presentAfterInsert = new Set(
          viewsAfterInsert.map((v) => `${v.internalMCPServerId}/${v.vaultId}`)
        );
        const stillMissingRows = missingRows.filter(
          (row) =>
            !presentAfterInsert.has(`${row.internalMCPServerId}/${row.vaultId}`)
        );

        if (stillMissingRows.length > 0) {
          // The run is reported as incomplete so callers do not cache the workspace as
          // hydrated and the next read retries.
          complete = false;
          logger.warn(
            {
              workspaceId: workspace.sId,
              attempted: missingRows.length,
              created: createdViewsCount,
              missingInternalMCPServerIds: removeNulls(
                stillMissingRows.map((row) => row.internalMCPServerId ?? null)
              ),
            },
            "ensureAllAutoToolsAreCreated: some auto MCP server views could not be inserted (conflict on another unique constraint)."
          );
        } else {
          logger.info(
            {
              workspaceId: workspace.sId,
              attempted: missingRows.length,
              created: createdViewsCount,
            },
            "ensureAllAutoToolsAreCreated: lost insert race, views were created concurrently."
          );
        }
      }

      return { createdViewsCount, complete };
    });
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("mcp_server_view", {
      id,
      workspaceId,
    });
  }

  private makeEditedBy(
    editedByUser: Attributes<UserModel> | undefined,
    editedAt: Date | undefined
  ) {
    if (!editedByUser || !editedAt) {
      return null;
    }

    return {
      editedAt: editedAt.getTime(),
      fullName: formatUserFullName(editedByUser),
      imageUrl: editedByUser.imageUrl,
      email: editedByUser.email,
      userId: editedByUser.sId,
    };
  }

  private get allToolsMetadata(): Attributes<RemoteMCPServerToolMetadataModel>[] {
    return [
      ...(this.internalToolsMetadata ?? []),
      ...(this.remoteToolsMetadata ?? []),
    ];
  }

  get getToolPermissions(): {
    toolName: string;
    permission: MCPToolStakeLevelType;
    enabled: boolean;
  }[] {
    if (this.serverType === "internal" && this.internalMCPServerId) {
      const nameResult = getInternalMCPServerNameAndWorkspaceId(
        this.internalMCPServerId
      );
      if (nameResult.isOk()) {
        const tools =
          INTERNAL_MCP_SERVERS[nameResult.value.name].metadata.tools;
        const overrides = new Map(
          this.allToolsMetadata.map((m) => [m.toolName, m])
        );
        return tools.map((tool) => {
          const override = overrides.get(tool.name);
          return {
            toolName: tool.name,
            permission: override?.permission ?? tool.stake,
            enabled: override?.enabled ?? true,
          };
        });
      }
    }
    return this.allToolsMetadata.map((t) => ({
      toolName: t.toolName,
      permission: t.permission,
      enabled: t.enabled,
    }));
  }

  // Serialization.
  toJSON(): MCPServerViewType {
    const server =
      this.serverType === "remote"
        ? this.getRemoteMCPServerResource().toJSON()
        : this.getInternalMCPServerResource().toJSON();

    // Override the server's default authorization scope with the admin-configured
    // restriction if one has been set. This ensures personal connections and
    // platform OAuth setup both use the restricted scope.
    const serverWithScope = {
      ...server,
      authorization: this.getAuthorization(),
    };

    return {
      id: this.id,
      sId: this.sId,
      name: this.name,
      description: this.description,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      spaceId: this.space.sId,
      serverType: this.serverType,
      server: serverWithScope,
      oAuthUseCase: this.oAuthUseCase,
      isRestrictedToSkills: this.isRestrictedToSkills,
      editedByUser: this.makeEditedBy(
        this.editedByUser,
        this.remoteMCPServer ? this.remoteMCPServer.updatedAt : this.updatedAt
      ),
      toolsMetadata: this.allToolsMetadata.map((t) => ({
        toolName: t.toolName,
        permission: t.permission,
        enabled: t.enabled,
      })),
    };
  }

  /**
   * Light serialization for list surfaces (conversation capabilities picker, slash menu) that
   * only render names, descriptions and icons. Remote tools are not included at all (surfaces
   * needing them fetch the full server on demand), so no heavy attribute is required at fetch
   * time.
   */
  toJSONLight(): MCPServerViewLightType {
    let server: MCPServerLightType;
    if (this.serverType === "remote") {
      const remoteServer = this.getRemoteMCPServerResource();
      server = {
        sId: remoteServer.sId,
        name: remoteServer.cachedName,
        description:
          remoteServer.cachedDescription ?? DEFAULT_MCP_ACTION_DESCRIPTION,
        icon: remoteServer.icon,
        tools: [],
      };
    } else {
      const internalServer = this.getInternalMCPServerResource().toJSON();
      server = {
        sId: internalServer.sId,
        name: internalServer.name,
        description: internalServer.description,
        icon: internalServer.icon,
        tools: internalServer.tools.map(({ name, description }) => ({
          name,
          description,
        })),
      };
    }

    return {
      sId: this.sId,
      name: this.name,
      description: this.description,
      server,
    };
  }
}
