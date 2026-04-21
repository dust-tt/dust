import {
  DEFAULT_MCP_ACTION_DESCRIPTION,
  DEFAULT_MCP_ACTION_NAME,
  DEFAULT_MCP_ACTION_VERSION,
  DEFAULT_MCP_SERVER_ICON,
} from "@app/lib/actions/constants";
import {
  autoInternalMCPServerNameToSId,
  doesInternalMCPServerRequireBearerToken,
  internalMCPServerNameToSId,
} from "@app/lib/actions/mcp_helper";
import type {
  InternalMCPServerNameType,
  MCPServerAvailability,
} from "@app/lib/actions/mcp_internal_actions/constants";
import {
  AVAILABLE_INTERNAL_MCP_SERVER_NAMES,
  allowsMultipleInstancesOfInternalMCPServerById,
  allowsMultipleInstancesOfInternalMCPServerByName,
  getAvailabilityOfInternalMCPServerById,
  getInternalMCPServerMetadata,
  getInternalMCPServerNameAndWorkspaceId,
  INTERNAL_MCP_SERVERS,
  isAutoInternalMCPServerName,
  matchesInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { isDeepDiveDisabledByAdmin } from "@app/lib/api/assistant/global_agents/configurations/dust/utils";
import type { MCPServerType } from "@app/lib/api/mcp";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { InternalMCPServerCredentialModel } from "@app/lib/models/agent/actions/internal_mcp_server_credentials";
import { MCPServerConnectionModel } from "@app/lib/models/agent/actions/mcp_server_connection";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { destroyMCPServerViewDependencies } from "@app/lib/models/agent/actions/mcp_server_view_helper";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/agent/actions/remote_mcp_server_tool_metadata";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { MCPOAuthUseCase } from "@app/types/oauth/lib";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { decrypt, encrypt } from "@app/types/shared/utils/encryption";
import { removeNulls } from "@app/types/shared/utils/general";
import { redactString } from "@app/types/shared/utils/string_utils";
import { Op } from "sequelize";

export class InternalMCPServerInMemoryResource {
  private metadata: Omit<
    MCPServerType,
    "sId" | "allowMultipleInstances" | "availability"
  >;
  private internalServerCredential: {
    sharedSecret: string | null;
    customHeaders: Record<string, string> | null;
  } | null;

  constructor(
    readonly id: string,
    readonly availability: MCPServerAvailability,
    {
      metadata = {
        name: DEFAULT_MCP_ACTION_NAME,
        version: DEFAULT_MCP_ACTION_VERSION,
        description: DEFAULT_MCP_ACTION_DESCRIPTION,
        icon: DEFAULT_MCP_SERVER_ICON,
        authorization: null,
        documentationUrl: null,
        tools: [],
      },
      internalServerCredential = null,
    }: {
      metadata?: Omit<
        MCPServerType,
        "sId" | "allowMultipleInstances" | "availability"
      >;
      internalServerCredential?: {
        sharedSecret: string | null;
        customHeaders: Record<string, string> | null;
      } | null;
    } = {}
  ) {
    this.metadata = metadata;
    this.internalServerCredential = internalServerCredential;
  }

  private static async computeEnabledServerNames(
    auth: Authenticator,
    names: readonly InternalMCPServerNameType[]
  ): Promise<Set<InternalMCPServerNameType>> {
    const uniqueNames = [...new Set(names)];
    const featureFlags = await getFeatureFlags(auth);
    const isDeepDiveDisabled = await isDeepDiveDisabledByAdmin(auth);
    const plan = auth.getNonNullablePlan();

    return new Set(
      uniqueNames.filter(
        (name) =>
          !INTERNAL_MCP_SERVERS[name].isRestricted?.({
            featureFlags,
            isDeepDiveDisabled,
            plan,
          })
      )
    );
  }

  static async makeNew(
    auth: Authenticator,
    {
      name,
      useCase,
      viewName,
      oauthScope,
    }: {
      name: InternalMCPServerNameType;
      useCase: MCPOAuthUseCase | null;
      viewName?: string;
      oauthScope?: string | null;
    }
  ) {
    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);

    if (!systemSpace.canAdministrate(auth)) {
      throw new DustError(
        "unauthorized",
        "The user is not authorized to create an internal MCP server"
      );
    }

    let sid: string | null = null;

    if (isAutoInternalMCPServerName(name)) {
      sid = autoInternalMCPServerNameToSId({
        name,
        workspaceId: auth.getNonNullableWorkspace().id,
      });
    } else {
      const alreadyUsedIds = await MCPServerViewModel.findAll({
        where: {
          serverType: "internal",
          workspaceId: auth.getNonNullableWorkspace().id,
          vaultId: systemSpace.id,
        },
      });

      if (!allowsMultipleInstancesOfInternalMCPServerByName(name)) {
        const alreadyExistsForSameName = alreadyUsedIds.some((r) => {
          return matchesInternalMCPServerName(r.internalMCPServerId, name);
        });

        if (alreadyExistsForSameName) {
          throw new DustError(
            "internal_error",
            "The internal MCP server already exists for this name."
          );
        }
      }

      // 100 tries to avoid an infinite loop.
      for (let i = 1; i < 100; i++) {
        const prefix = Math.floor(Math.random() * 1000000);
        const tempSid = internalMCPServerNameToSId({
          name,
          workspaceId: auth.getNonNullableWorkspace().id,
          prefix,
        });
        if (!alreadyUsedIds.some((r) => r.internalMCPServerId === tempSid)) {
          sid = tempSid;
          break;
        }
      }
    }

    if (!sid) {
      throw new DustError(
        "internal_error",
        "Could not find an available id for the internal MCP server."
      );
    }

    const resolvedServerName = getInternalMCPServerNameAndWorkspaceId(sid);
    if (resolvedServerName.isErr()) {
      throw new DustError(
        "internal_server_not_found",
        "Failed to create internal MCP server, the id is probably invalid."
      );
    }

    const serverName = resolvedServerName.value.name;
    const mcpServer = INTERNAL_MCP_SERVERS[serverName];

    let isEnabled = true;
    if (mcpServer.isRestricted) {
      const featureFlags = await getFeatureFlags(auth);
      const isDeepDiveDisabled = await isDeepDiveDisabledByAdmin(auth);
      isEnabled = !mcpServer.isRestricted({
        featureFlags,
        isDeepDiveDisabled,
        plan: auth.getNonNullablePlan(),
      });
    }
    if (!isEnabled) {
      logger.info(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          serverName,
        },
        "Initializing restricted internal MCP server from existing view"
      );
    }

    const serverMetadata = getInternalMCPServerMetadata(serverName);
    const server = new this(sid, getAvailabilityOfInternalMCPServerById(sid), {
      metadata: {
        ...serverMetadata.serverInfo,
        tools: serverMetadata.tools,
      },
      internalServerCredential: null,
    });

    await MCPServerViewModel.create({
      workspaceId: auth.getNonNullableWorkspace().id,
      serverType: "internal",
      internalMCPServerId: server.id,
      vaultId: systemSpace.id,
      editedAt: new Date(),
      editedByUserId: auth.user()?.id,
      oAuthUseCase: useCase ?? null,
      oauthScope: oauthScope ?? null,
      ...(viewName ? { name: viewName } : {}),
    });

    return server;
  }

  async delete(
    auth: Authenticator
  ): Promise<Result<number, DustError<"unauthorized">>> {
    const canAdministrate =
      await SpaceResource.canAdministrateSystemSpace(auth);

    if (!canAdministrate) {
      throw new Err(
        new DustError(
          "unauthorized",
          "The user is not authorized to delete an internal MCP server"
        )
      );
    }

    const mcpServerViews = await MCPServerViewModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        internalMCPServerId: this.id,
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

    await MCPServerViewModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        internalMCPServerId: this.id,
      },
      hardDelete: true,
    });

    await MCPServerConnectionModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        internalMCPServerId: this.id,
      },
    });

    await RemoteMCPServerToolMetadataModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        internalMCPServerId: this.id,
      },
    });

    await InternalMCPServerCredentialModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        internalMCPServerId: this.id,
      },
    });

    return new Ok(1);
  }

  static async fetchById(
    auth: Authenticator,
    id: string,
    systemSpace: SpaceResource
  ) {
    const results = await this.fetchByIds(auth, [id], systemSpace);

    return results[0] ?? null;
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[],
    systemSpace: SpaceResource
  ): Promise<InternalMCPServerInMemoryResource[]> {
    if (ids.length === 0) {
      return [];
    }

    // Fast path: Do not check for default internal MCP servers as they are always available.
    const uniqueIds = [...new Set(ids)];

    const validIds = uniqueIds.filter(
      (id) => getAvailabilityOfInternalMCPServerById(id) !== "manual"
    );

    const manualIds = uniqueIds.filter(
      (id) => getAvailabilityOfInternalMCPServerById(id) === "manual"
    );

    const servers = await MCPServerViewModel.findAll({
      attributes: ["internalMCPServerId"],
      where: {
        serverType: "internal",
        internalMCPServerId: { [Op.in]: manualIds },
        workspaceId: auth.getNonNullableWorkspace().id,
        vaultId: systemSpace.id,
      },
    });
    validIds.push(...removeNulls(servers.map((s) => s.internalMCPServerId)));

    const availableIds = [...new Set(validIds)];
    const resolvedIds = removeNulls(
      availableIds.map((id) => {
        const resolvedName = getInternalMCPServerNameAndWorkspaceId(id);
        return resolvedName.isOk()
          ? { id, name: resolvedName.value.name }
          : null;
      })
    );

    // Filter out the names of the servers that are not enabled (e.g. gated behind a feature flag that is not enabled).
    const enabledServerNames = await this.computeEnabledServerNames(
      auth,
      resolvedIds.map(({ name }) => name)
    );

    // Fetch the credentials (API keys, headers) for MCP servers that have some.
    const decryptedCredentials = await this.fetchDecryptedCredentialsByIds(
      auth,
      resolvedIds.map(({ id }) => id)
    );
    const credentialsById = new Map(
      decryptedCredentials.map((credential) => [
        credential.internalMCPServerId,
        {
          sharedSecret: credential.sharedSecret,
          customHeaders: credential.customHeaders,
        },
      ])
    );

    return resolvedIds.map(({ id, name }) => {
      if (!enabledServerNames.has(name)) {
        logger.info(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            serverName: name,
          },
          "Initializing restricted internal MCP server from existing view"
        );
      }

      const serverMetadata = getInternalMCPServerMetadata(name);
      return new this(id, getAvailabilityOfInternalMCPServerById(id), {
        metadata: {
          ...serverMetadata.serverInfo,
          tools: serverMetadata.tools,
        },
        internalServerCredential: credentialsById.get(id) ?? null,
      });
    });
  }

  static async listAvailableInternalMCPServers(auth: Authenticator) {
    const enabledServerNames = await this.computeEnabledServerNames(
      auth,
      AVAILABLE_INTERNAL_MCP_SERVER_NAMES
    );

    const names = AVAILABLE_INTERNAL_MCP_SERVER_NAMES.filter((name) =>
      enabledServerNames.has(name)
    );

    const ids = names.map((name) =>
      internalMCPServerNameToSId({
        name,
        workspaceId: auth.getNonNullableWorkspace().id,
        prefix: 1, // We could use any value here.
      })
    );

    const decryptedCredentials = await this.fetchDecryptedCredentialsByIds(
      auth,
      ids
    );
    const credentialsById = new Map(
      decryptedCredentials.map((credential) => [
        credential.internalMCPServerId,
        {
          sharedSecret: credential.sharedSecret,
          customHeaders: credential.customHeaders,
        },
      ])
    );

    return names.map((name, index) => {
      const id = ids[index];
      const serverMetadata = getInternalMCPServerMetadata(name);
      return new this(id, getAvailabilityOfInternalMCPServerById(id), {
        metadata: {
          ...serverMetadata.serverInfo,
          tools: serverMetadata.tools,
        },
        internalServerCredential: credentialsById.get(id) ?? null,
      });
    });
  }

  static async listByWorkspace(auth: Authenticator) {
    // In case of internal MCP servers, we list the ones that have a view in the system space.
    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);

    const servers = await MCPServerViewModel.findAll({
      attributes: ["internalMCPServerId"],
      where: {
        serverType: "internal",
        internalMCPServerId: {
          [Op.not]: null,
        },
        workspaceId: auth.getNonNullableWorkspace().id,
        vaultId: systemSpace.id,
      },
    });

    const ids = [
      ...new Set(
        removeNulls(servers.map((server) => server.internalMCPServerId))
      ),
    ];
    const resolvedIds = removeNulls(
      ids.map((id) => {
        const resolvedName = getInternalMCPServerNameAndWorkspaceId(id);
        return resolvedName.isOk()
          ? { id, name: resolvedName.value.name }
          : null;
      })
    );

    const enabledServerNames = await this.computeEnabledServerNames(
      auth,
      resolvedIds.map(({ name }) => name)
    );
    const decryptedCredentials = await this.fetchDecryptedCredentialsByIds(
      auth,
      resolvedIds.map(({ id }) => id)
    );
    const credentialsById = new Map(
      decryptedCredentials.map((credential) => [
        credential.internalMCPServerId,
        {
          sharedSecret: credential.sharedSecret,
          customHeaders: credential.customHeaders,
        },
      ])
    );

    return resolvedIds.map(({ id, name }) => {
      if (!enabledServerNames.has(name)) {
        logger.info(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            serverName: name,
          },
          "Initializing restricted internal MCP server from existing view"
        );
      }

      const serverMetadata = getInternalMCPServerMetadata(name);
      return new this(id, getAvailabilityOfInternalMCPServerById(id), {
        metadata: {
          ...serverMetadata.serverInfo,
          tools: serverMetadata.tools,
        },
        internalServerCredential: credentialsById.get(id) ?? null,
      });
    });
  }

  async upsertCredentials(
    auth: Authenticator,
    {
      sharedSecret,
      customHeaders,
    }: {
      sharedSecret?: string;
      customHeaders?: Record<string, string> | null;
    }
  ): Promise<Result<void, DustError<"unauthorized">>> {
    const canAdministrate =
      await SpaceResource.canAdministrateSystemSpace(auth);

    if (!canAdministrate) {
      return new Err(
        new DustError(
          "unauthorized",
          "The user is not authorized to update this MCP server."
        )
      );
    }

    const workspace = auth.getNonNullableWorkspace();
    const encryptedKey = sharedSecret
      ? encrypt({
          text: sharedSecret,
          key: workspace.sId,
          useCase: "mcp_server_credentials",
        })
      : null;

    const existing = await InternalMCPServerCredentialModel.findOne({
      where: {
        workspaceId: workspace.id,
        internalMCPServerId: this.id,
      },
    });

    if (existing) {
      const updatePayload: Partial<{
        encryptedKey: string | null;
        customHeaders: Record<string, string> | null;
      }> = {};

      if (sharedSecret !== undefined) {
        updatePayload.encryptedKey = encryptedKey;
      }
      if (customHeaders !== undefined) {
        updatePayload.customHeaders = customHeaders ?? null;
      }

      if (Object.keys(updatePayload).length > 0) {
        await existing.update(updatePayload);
      }
    } else {
      await InternalMCPServerCredentialModel.create({
        workspaceId: workspace.id,
        internalMCPServerId: this.id,
        encryptedKey,
        customHeaders: customHeaders ?? null,
      });
    }

    this.internalServerCredential = {
      sharedSecret: sharedSecret ?? null,
      customHeaders: customHeaders ?? null,
    };

    return new Ok(undefined);
  }

  private getRedactedCredentials(): {
    sharedSecret: string | null;
    customHeaders: Record<string, string> | null;
  } {
    if (!doesInternalMCPServerRequireBearerToken(this.id)) {
      return { sharedSecret: null, customHeaders: null };
    }

    if (!this.internalServerCredential) {
      return { sharedSecret: null, customHeaders: null };
    }

    const redactedSecret = this.internalServerCredential.sharedSecret
      ? redactString(this.internalServerCredential.sharedSecret, 4)
      : null;

    const redactedHeaders = this.internalServerCredential.customHeaders
      ? Object.fromEntries(
          Object.entries(this.internalServerCredential.customHeaders).map(
            ([key, value]) => [
              key,
              value !== null && value !== undefined
                ? redactString(value, 4)
                : value,
            ]
          )
        )
      : null;

    return {
      sharedSecret: redactedSecret,
      customHeaders: redactedHeaders,
    };
  }

  static async fetchDecryptedCredentialsByIds(
    auth: Authenticator,
    internalMCPServerIds: string[]
  ): Promise<
    {
      internalMCPServerId: string;
      sharedSecret: string | null;
      customHeaders: Record<string, string> | null;
    }[]
  > {
    const idsRequiringBearerToken = [
      ...new Set(
        internalMCPServerIds.filter((id) =>
          doesInternalMCPServerRequireBearerToken(id)
        )
      ),
    ];

    if (idsRequiringBearerToken.length === 0) {
      return [];
    }

    const credentials = await InternalMCPServerCredentialModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        internalMCPServerId: {
          [Op.in]: idsRequiringBearerToken,
        },
      },
    });

    return credentials.map((credential) => ({
      internalMCPServerId: credential.internalMCPServerId,
      sharedSecret: credential.encryptedKey
        ? decrypt({
            encrypted: credential.encryptedKey,
            key: auth.getNonNullableWorkspace().sId,
            useCase: "mcp_server_credentials",
          })
        : null,
      customHeaders: credential.customHeaders,
    }));
  }

  // Serialization.
  toJSON(): MCPServerType {
    return {
      sId: this.id,
      ...this.metadata,
      ...this.getRedactedCredentials(),
      availability: this.availability,
      allowMultipleInstances: allowsMultipleInstancesOfInternalMCPServerById(
        this.id
      ),
    };
  }
}
