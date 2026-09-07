import {
  listWorkOSOrganizationsWithDomain,
  removeWorkOSOrganizationDomain,
  removeWorkOSOrganizationDomainFromOrganization,
} from "@app/lib/api/workos/organization_primitives";
import type { Authenticator } from "@app/lib/auth";
import {
  CONVERSATIONS_RETENTION_MIN_DAYS,
  isValidConversationsRetentionDays,
} from "@app/lib/conversations_retention";
import { FeatureFlagModel } from "@app/lib/models/feature_flag";
import type { PlanLimitOverride } from "@app/lib/plans/plan_limit_overrides";
import {
  hasAnyPlanLimitOverride,
  OVERRIDABLE_PLAN_LIMITS,
} from "@app/lib/plans/plan_limit_overrides";
import type { KillSwitchType } from "@app/lib/poke/types";
import type {
  ResourceLogJSON,
  ResourceUpdateBlob,
} from "@app/lib/resources/base_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import { defineCachedResourceStore } from "@app/lib/resources/cached_resource_store";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import type { ModelProviderIdType } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import { WorkspacePlanLimitOverrideModel } from "@app/lib/resources/storage/models/workspace_plan_limit_override";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { UserResource } from "@app/lib/resources/user_resource";
import type { GitHubConnectionStatus } from "@app/lib/skill_detection";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { terminateAllAgentLoopWorkflowsForConversation } from "@app/temporal/agent_loop/terminate";
import { MODEL_PROVIDER_IDS } from "@app/types/assistant/models/providers";
import type {
  WorkspacePoolCreditState,
  WorkspaceProgrammaticCreditState,
} from "@app/types/credits";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString, isStringArray } from "@app/types/shared/utils/general";
import type { WorkspaceSegmentationType } from "@app/types/user";
import type { WorkspaceDomain } from "@app/types/workspace";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";
import { z } from "zod";

const WORKSPACE_FULLY_BLOCKED_ERROR_MESSAGE =
  "Workspace is fully blocked. Use `workspace unblock` before managing conversation blocks.";
const INVALID_WORKSPACE_KILL_SWITCH_METADATA_ERROR_PREFIX =
  "Invalid workspace kill switch metadata:";
const WORKSPACE_CACHE_KEY_VERSION = 3;

export type WorkspaceConversationKillSwitchValue = {
  conversationIds: string[];
};

type WorkspaceModelIdBatchRow = {
  workspaceModelId: ModelId;
  workspaceId: string;
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface WorkspaceResource
  extends ReadonlyAttributesType<WorkspaceModel> {}

export const WORKSPACE_CONVERSATION_KILL_SWITCH_OPERATIONS = [
  "block",
  "unblock",
] as const;
export type WorkspaceConversationKillSwitchOperation =
  (typeof WORKSPACE_CONVERSATION_KILL_SWITCH_OPERATIONS)[number];
export const WORKSPACE_KILL_SWITCH_OPERATIONS = ["block", "unblock"] as const;
export type WorkspaceKillSwitchOperation =
  (typeof WORKSPACE_KILL_SWITCH_OPERATIONS)[number];
type UpdateWorkspaceKillSwitchResult = {
  wasUpdated: boolean;
};
type UpdateWorkspaceConversationKillSwitchResult = {
  wasUpdated: boolean;
};

function renderPlanLimitOverride(
  row: WorkspacePlanLimitOverrideModel
): PlanLimitOverride {
  return {
    maxUsersInWorkspace: row.maxUsersInWorkspace,
    maxFreeUsersInWorkspace: row.maxFreeUsersInWorkspace,
    maxLifetimeFreeUsersInWorkspace: row.maxLifetimeFreeUsersInWorkspace,
    maxVaultsInWorkspace: row.maxVaultsInWorkspace,
    maxDataSourcesCount: row.maxDataSourcesCount,
    maxConnectionsCount: row.maxConnectionsCount,
    isSSOAllowed: row.isSSOAllowed,
    isSCIMAllowed: row.isSCIMAllowed,
  };
}

// A numeric limit is `null` (not overridden), `-1` (unlimited) or a non-negative
// count, matching the plan convention. Boolean flags need no range check.
function validatePlanLimitOverride(
  override: PlanLimitOverride
): Result<undefined, Error> {
  for (const key of OVERRIDABLE_PLAN_LIMITS) {
    const value = override[key];
    if (value !== null && (!Number.isInteger(value) || value < -1)) {
      return new Err(
        new Error(
          `${key} must be -1 (unlimited) or a non-negative integer, got ${value}.`
        )
      );
    }
  }

  return new Ok(undefined);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class WorkspaceResource extends BaseResource<WorkspaceModel> {
  static model: ModelStatic<WorkspaceModel> = WorkspaceModel;
  private static workspaceDomainModel: ModelStaticWorkspaceAware<WorkspaceHasDomainModel> =
    WorkspaceHasDomainModel;
  private static planLimitOverrideModel: ModelStaticWorkspaceAware<WorkspacePlanLimitOverrideModel> =
    WorkspacePlanLimitOverrideModel;
  static readonly KILL_SWITCH_METADATA_KEY = "killSwitched";
  static readonly FULL_WORKSPACE_KILL_SWITCH_VALUE = "full";

  readonly blob: Attributes<WorkspaceModel>;

  constructor(
    model: ModelStatic<WorkspaceModel>,
    blob: Attributes<WorkspaceModel>
  ) {
    super(WorkspaceModel, blob);
    this.blob = blob;
  }

  private static readonly store = defineCachedResourceStore({
    model: WorkspaceModel,
    materialize: (blobs) => WorkspaceResource.materialize(blobs),
    cache: {
      id: "workspace_by_sid",
      version: WORKSPACE_CACHE_KEY_VERSION,
      keyAttribute: "sId",
      migration: {
        previousKey: {
          cacheId: "_fetchByIdUncached",
          key: (workspaceId: string) => `workspace:v2:${workspaceId}`,
          keyPattern: "workspace:v2:*",
        },
        readFrom: "new",
        copyToOtherKey: "after_read",
      },
    },
  });

  static readonly byIdCacheOperations =
    WorkspaceResource.store.createCacheOperations({
      label: "Workspace (by sId)",
      inputSchema: z.object({ wId: z.string().min(1) }),
      params: [
        {
          key: "wId",
          label: "Workspace sId",
          type: "string",
          placeholder: "e.g. abc123",
        },
      ],
      toLookupInput: ({ wId }) => wId,
    });

  static isWorkspaceConversationKillSwitchValue(
    killSwitched: unknown
  ): killSwitched is WorkspaceConversationKillSwitchValue {
    if (typeof killSwitched !== "object" || killSwitched === null) {
      return false;
    }

    if (!("conversationIds" in killSwitched)) {
      return false;
    }

    return isStringArray(killSwitched.conversationIds);
  }

  static isWorkspaceKillSwitchedForAllAPIs(killSwitched: unknown): boolean {
    return killSwitched === WorkspaceResource.FULL_WORKSPACE_KILL_SWITCH_VALUE;
  }

  static isWorkspaceConversationKillSwitched(
    killSwitched: unknown,
    conversationId: string
  ): boolean {
    if (
      !WorkspaceResource.isWorkspaceConversationKillSwitchValue(killSwitched)
    ) {
      return false;
    }

    return killSwitched.conversationIds.includes(conversationId);
  }

  private static filterKillSwitchedProviders(
    whiteListedProviders: ModelProviderIdType[] | null,
    enabledKillSwitches: KillSwitchType[]
  ): ModelProviderIdType[] | null {
    const isAnthropicBlacklisted = enabledKillSwitches.includes(
      "global_blacklist_anthropic"
    );
    const isOpenaiBlacklisted = enabledKillSwitches.includes(
      "global_blacklist_openai"
    );
    if (isAnthropicBlacklisted || isOpenaiBlacklisted) {
      return (whiteListedProviders ?? MODEL_PROVIDER_IDS).filter(
        (p) =>
          (isAnthropicBlacklisted ? p !== "anthropic" : true) &&
          (isOpenaiBlacklisted ? p !== "openai" : true)
      );
    }
    return whiteListedProviders;
  }

  public static async getWhiteListedProvidersFilteredByKillSwitches(
    whiteListedProviders: ModelProviderIdType[] | null
  ): Promise<ModelProviderIdType[] | null> {
    const enabledKillSwitches =
      await KillSwitchResource.listEnabledKillSwitches();
    return WorkspaceResource.filterKillSwitchedProviders(
      whiteListedProviders,
      enabledKillSwitches
    );
  }

  // Materialization: the single seam where fetched blobs become resources, run by every fetch
  // path (cached or not). This is where context outside the row is folded in: provider kill
  // switches here, so a WorkspaceResource always carries the effective whiteListedProviders while
  // the cache keeps the raw column value. Never persist whiteListedProviders read from a
  // materialized resource: that would make a temporary kill switch permanent.
  // TODO(2026-08-21 flav): Move the kill-switch overlay to its consumption points (Authenticator
  // and model gating) so workspace fetches stay pure and this materialize becomes plain
  // construction.
  private static async materialize(
    blobs: Attributes<WorkspaceModel>[]
  ): Promise<WorkspaceResource[]> {
    if (blobs.length === 0) {
      return [];
    }
    const enabledKillSwitches =
      await KillSwitchResource.listEnabledKillSwitches();
    return blobs.map(
      (blob) =>
        new WorkspaceResource(WorkspaceModel, {
          ...blob,
          whiteListedProviders: WorkspaceResource.filterKillSwitchedProviders(
            blob.whiteListedProviders,
            enabledKillSwitches
          ),
        })
    );
  }

  static async invalidateCache(workspaceId: string): Promise<void> {
    await WorkspaceResource.store.invalidateCached(workspaceId);
  }

  protected override async update(
    blob: ResourceUpdateBlob<WorkspaceModel>,
    transaction?: Transaction
  ): Promise<[affectedCount: number]> {
    // Dual write: keep sharingPolicy in sync when metadata.allowContentCreationFileSharing changes.
    // TODO(2026-03-19: Frame sharing) Remove dual write once reads switch to sharingPolicy.
    if (blob.metadata && "allowContentCreationFileSharing" in blob.metadata) {
      const newPolicy =
        blob.metadata.allowContentCreationFileSharing === false
          ? "workspace_and_emails"
          : "all_scopes";
      if (newPolicy !== this.sharingPolicy) {
        blob.sharingPolicy = newPolicy;
      }
    }

    const result = await super.update(blob, transaction);
    await WorkspaceResource.store.invalidateBlob(this.blob, transaction);
    return result;
  }

  static async makeNew(
    blob: CreationAttributes<WorkspaceModel>,
    transaction?: Transaction
  ): Promise<WorkspaceResource> {
    return WorkspaceResource.store.create(blob, transaction);
  }

  static async fetchById(
    wId: string,
    transaction?: Transaction
  ): Promise<WorkspaceResource | null> {
    return WorkspaceResource.store.fetchCached(wId, transaction);
  }

  static async fetchByName(name: string): Promise<WorkspaceResource | null> {
    const [workspace] = await this.store.baseFetch({
      where: { name },
      limit: 1,
    });
    return workspace ?? null;
  }

  static async fetchByModelIds(ids: ModelId[]): Promise<WorkspaceResource[]> {
    return this.store.baseFetch({
      where: {
        id: {
          [Op.in]: ids,
        },
      },
    });
  }

  static async fetchByIds(wIds: string[]): Promise<WorkspaceResource[]> {
    return this.store.baseFetch({
      where: {
        sId: {
          [Op.in]: wIds,
        },
      },
    });
  }

  static async fetchModelIdsByIds(wIds: string[]): Promise<ModelId[]> {
    const workspaces = await this.model.findAll({
      attributes: ["id"],
      where: {
        sId: {
          [Op.in]: wIds,
        },
      },
    });
    return workspaces.map((w) => w.id);
  }

  private static async fetchWorkspaceAndDomainInfo(domain: string): Promise<{
    workspace: WorkspaceResource;
    domainInfo: WorkspaceDomain;
  } | null> {
    const workspaceDomain = await this.workspaceDomainModel.findOne({
      where: { domain },
      // WORKSPACE_ISOLATION_BYPASS: Looking up which workspace owns a domain requires cross-workspace query.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    if (!workspaceDomain) {
      return null;
    }

    const [workspace] = await this.store.baseFetch({
      where: { id: workspaceDomain.workspaceId },
      limit: 1,
    });

    if (!workspace) {
      return null;
    }

    return {
      workspace,
      domainInfo: {
        domain: workspaceDomain.domain,
        domainAutoJoinEnabled: workspaceDomain.domainAutoJoinEnabled,
      },
    };
  }

  static async fetchByDomain(
    domain: string
  ): Promise<WorkspaceResource | null> {
    const result = await this.fetchWorkspaceAndDomainInfo(domain);
    return result?.workspace ?? null;
  }

  static async fetchByDomainWithInfo(domain: string): Promise<{
    workspace: WorkspaceResource;
    domainInfo: WorkspaceDomain;
  } | null> {
    return this.fetchWorkspaceAndDomainInfo(domain);
  }

  static async isDomainAutoJoinEnabled(domain: string): Promise<boolean> {
    const result = await this.fetchWorkspaceAndDomainInfo(domain);
    return result?.domainInfo.domainAutoJoinEnabled ?? false;
  }

  static async fetchByMetronomeCustomerId(
    metronomeCustomerId: string
  ): Promise<WorkspaceResource | null> {
    const [workspace] = await this.store.baseFetch({
      where: { metronomeCustomerId },
      limit: 1,
    });
    return workspace ?? null;
  }

  static async fetchByWorkOSOrganizationId(
    workOSOrganizationId: string
  ): Promise<WorkspaceResource | null> {
    const [workspace] = await this.store.baseFetch({
      where: { workOSOrganizationId },
      limit: 1,
    });
    return workspace ?? null;
  }

  static async listAll(
    order?: "ASC" | "DESC",
    {
      where,
    }: {
      where?: WhereOptions<Attributes<WorkspaceModel>>;
    } = {}
  ): Promise<WorkspaceResource[]> {
    return this.store.baseFetch({
      ...(order && { order: [["id", order]] }),
      ...(where && { where }),
    });
  }

  static async listAllModelIds(order?: "ASC" | "DESC"): Promise<ModelId[]> {
    const workspaces = await this.model.findAll({
      attributes: ["id"],
      ...(order && { order: [["id", order]] }),
    });
    return workspaces.map((w) => w.id);
  }

  static async unsafeListWorkspaceIdBatchAfterModelId({
    lastWorkspaceModelId,
    limit,
  }: {
    lastWorkspaceModelId: ModelId;
    limit: number;
  }): Promise<WorkspaceModelIdBatchRow[]> {
    const workspaces = await this.model.findAll({
      attributes: ["id", "sId"],
      where: {
        id: {
          [Op.gt]: lastWorkspaceModelId,
        },
      },
      order: [["id", "ASC"]],
      limit,
    });

    return workspaces.map((workspace) => ({
      workspaceModelId: workspace.id,
      workspaceId: workspace.sId,
    }));
  }

  static async listModelIdsWithConversationsRetention(): Promise<ModelId[]> {
    const workspaces = await this.model.findAll({
      attributes: ["id"],
      where: {
        conversationsRetentionDays: {
          [Op.not]: null,
        },
      },
    });
    return workspaces.map((w) => w.id);
  }

  static async listWithFeatureFlag(
    name: WhitelistableFeature
  ): Promise<WorkspaceResource[]> {
    const flagRows = await FeatureFlagModel.findAll({
      attributes: ["workspaceId"],
      where: {
        name,
      },
      // WORKSPACE_ISOLATION_BYPASS: cross-workspace listing of workspaces with a given feature flag enabled.
      // @ts-expect-error -- Cross-workspace query by design.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });
    const workspaceModelIds = Array.from(
      new Set(flagRows.map((f) => f.workspaceId))
    );
    if (workspaceModelIds.length === 0) {
      return [];
    }
    return this.store.baseFetch({
      where: { id: { [Op.in]: workspaceModelIds } },
    });
  }

  async updateSegmentation(segmentation: WorkspaceSegmentationType) {
    return this.update({ segmentation });
  }

  async updatePoolCreditState(
    poolCreditState: WorkspacePoolCreditState,
    transaction?: Transaction
  ): Promise<void> {
    await this.update({ poolCreditState }, transaction);
  }

  async updateProgrammaticCreditState(
    programmaticCreditState: WorkspaceProgrammaticCreditState,
    transaction?: Transaction
  ): Promise<void> {
    await this.update({ programmaticCreditState }, transaction);
  }

  async updateWorkspaceSettings(
    updateableAttributes: Partial<
      Pick<
        CreationAttributes<WorkspaceModel>,
        | "name"
        | "ssoEnforced"
        | "regionalModelsOnly"
        | "whiteListedProviders"
        | "defaultEmbeddingProvider"
        | "workOSOrganizationId"
        | "metadata"
        | "sharingPolicy"
      >
    >
  ) {
    return this.update(updateableAttributes);
  }

  async updateDomainAutoJoinEnabled({
    domainAutoJoinEnabled,
    domain,
  }: {
    domainAutoJoinEnabled: boolean;
    domain?: string;
  }): Promise<Result<void, Error>> {
    const [affectedCount] = await WorkspaceResource.workspaceDomainModel.update(
      { domainAutoJoinEnabled },
      {
        where: {
          workspaceId: this.id,
          ...(domain ? { domain } : {}),
        },
      }
    );

    if (affectedCount === 0) {
      return new Err(
        new Error("The workspace does not have any verified domain.")
      );
    }

    return new Ok(undefined);
  }

  async getVerifiedDomains(): Promise<WorkspaceDomain[]> {
    const workspaceDomains =
      await WorkspaceResource.workspaceDomainModel.findAll({
        attributes: ["domain", "domainAutoJoinEnabled"],
        where: {
          workspaceId: this.id,
        },
      });

    return workspaceDomains.map((d) => ({
      domain: d.domain,
      domainAutoJoinEnabled: d.domainAutoJoinEnabled,
    }));
  }

  async deleteDomain({
    domain,
  }: {
    domain: string;
  }): Promise<Result<void, Error>> {
    const existingDomain = await WorkspaceResource.workspaceDomainModel.findOne(
      {
        where: {
          domain,
          workspaceId: this.id,
        },
      }
    );

    if (!existingDomain) {
      return new Err(
        new Error(`Domain ${domain} not found for workspace ${this.sId}`)
      );
    }

    await existingDomain.destroy();

    return new Ok(undefined);
  }

  async upsertWorkspaceDomain({
    domain,
    dropExistingDomain = false,
  }: {
    domain: string;
    dropExistingDomain?: boolean;
  }): Promise<Result<WorkspaceDomain, Error>> {
    const existingDomainInRegion =
      await WorkspaceResource.workspaceDomainModel.findOne({
        where: { domain },
        // WORKSPACE_ISOLATION_BYPASS: Need to check domain across all workspaces.
        // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
        dangerouslyBypassWorkspaceIsolationSecurity: true,
      });

    if (
      existingDomainInRegion &&
      existingDomainInRegion.workspaceId === this.id
    ) {
      return new Ok({
        domain: existingDomainInRegion.domain,
        domainAutoJoinEnabled: existingDomainInRegion.domainAutoJoinEnabled,
      });
    }

    if (existingDomainInRegion) {
      if (dropExistingDomain) {
        logger.info(
          {
            domain,
            workspaceId: existingDomainInRegion.workspaceId,
          },
          "Dropping existing domain"
        );

        const [domainWorkspace] = await WorkspaceResource.fetchByModelIds([
          existingDomainInRegion.workspaceId,
        ]);

        if (!domainWorkspace) {
          return new Err(
            new Error(
              `Failed to fetch workspace ${existingDomainInRegion.workspaceId} while dropping domain ${domain}`
            )
          );
        }

        // Delete the domain from the DB.
        await existingDomainInRegion.destroy();

        // Delete the domain from WorkOS.
        await removeWorkOSOrganizationDomain(
          renderLightWorkspaceType({ workspace: domainWorkspace }),
          {
            domain,
          }
        );
      } else {
        return new Err(
          new Error(
            `Domain ${domain} already exists in workspace ${existingDomainInRegion.workspaceId}`
          )
        );
      }
    }

    // Ensure the domain is not already in use by another workspace in another region.
    const organizationsWithDomain =
      await listWorkOSOrganizationsWithDomain(domain);

    if (organizationsWithDomain.length > 0) {
      const otherOrganizationsWithDomain = organizationsWithDomain.filter(
        (o) => o.id !== this.workOSOrganizationId
      );

      const [otherOrganizationWithDomain] = otherOrganizationsWithDomain;
      if (otherOrganizationWithDomain) {
        if (dropExistingDomain) {
          logger.info(
            {
              domain,
              organizationId: otherOrganizationWithDomain.id,
            },
            "Dropping existing domain"
          );

          // Delete the domain from WorkOS.
          await removeWorkOSOrganizationDomainFromOrganization(
            otherOrganizationWithDomain,
            {
              domain,
            }
          );
        } else {
          return new Err(
            new Error(
              `Domain ${domain} already associated with organization ` +
                `${otherOrganizationWithDomain.id} - ${otherOrganizationWithDomain.metadata.region}`
            )
          );
        }
      }
    }

    const d = await WorkspaceResource.workspaceDomainModel.create({
      domain,
      domainAutoJoinEnabled: false,
      workspaceId: this.id,
    });

    return new Ok({
      domain: d.domain,
      domainAutoJoinEnabled: d.domainAutoJoinEnabled,
    });
  }

  static async updateName(
    id: ModelId,
    newName: string
  ): Promise<Result<void, Error>> {
    return this.updateByModelIdAndCheckExistence(id, { name: newName });
  }

  static async updateConversationsRetention(
    id: ModelId,
    nbDays: number
  ): Promise<Result<void, Error>> {
    return this.updateByModelIdAndCheckExistence(id, {
      conversationsRetentionDays: nbDays === -1 ? null : nbDays,
    });
  }

  static async updateMetadata(
    id: ModelId,
    metadata: Record<string, string | number | boolean | object> | null
  ): Promise<Result<void, Error>> {
    return this.updateByModelIdAndCheckExistence(id, { metadata });
  }

  async removeMetadataKeys(keys: string[]): Promise<Result<void, Error>> {
    const keysToRemove = new Set(keys);
    const newMetadata: Record<string, string | number | boolean | object> = {};
    for (const [key, value] of Object.entries(this.metadata ?? {})) {
      if (!keysToRemove.has(key) && value !== undefined) {
        newMetadata[key] = value;
      }
    }
    return WorkspaceResource.updateMetadata(this.id, newMetadata);
  }

  getSkillImportGitHubConnection(): {
    connectionId: string;
    connectedBy: string;
  } | null {
    const connection = this.metadata?.skillImportGithubConnection;
    if (
      typeof connection === "object" &&
      connection !== null &&
      "connectionId" in connection &&
      isString(connection.connectionId) &&
      "connectedBy" in connection &&
      isString(connection.connectedBy)
    ) {
      return {
        connectionId: connection.connectionId,
        connectedBy: connection.connectedBy,
      };
    }
    return null;
  }

  async getSkillImportGitHubConnectedByUser(): Promise<GitHubConnectionStatus | null> {
    const connection = this.getSkillImportGitHubConnection();
    if (!connection) {
      return null;
    }

    const user = await UserResource.fetchById(connection.connectedBy);
    if (!user) {
      return { connectedBy: null };
    }

    return {
      connectedBy: { fullName: user.fullName(), imageUrl: user.imageUrl },
    };
  }

  static async updateMetronomeCustomerId(
    id: ModelId,
    metronomeCustomerId: string
  ): Promise<Result<void, Error>> {
    return this.updateByModelIdAndCheckExistence(id, {
      metronomeCustomerId,
    });
  }

  async updateConversationKillSwitch({
    conversationId,
    operation,
  }: {
    conversationId: string;
    operation: WorkspaceConversationKillSwitchOperation;
  }): Promise<Result<UpdateWorkspaceConversationKillSwitchResult, Error>> {
    const currentKillSwitch =
      this.metadata?.[WorkspaceResource.KILL_SWITCH_METADATA_KEY];
    if (
      WorkspaceResource.isWorkspaceKillSwitchedForAllAPIs(currentKillSwitch)
    ) {
      return new Err(new Error(WORKSPACE_FULLY_BLOCKED_ERROR_MESSAGE));
    }
    if (
      currentKillSwitch !== undefined &&
      !WorkspaceResource.isWorkspaceConversationKillSwitchValue(
        currentKillSwitch
      )
    ) {
      return new Err(
        new Error(
          `${INVALID_WORKSPACE_KILL_SWITCH_METADATA_ERROR_PREFIX} ${JSON.stringify(currentKillSwitch)}`
        )
      );
    }

    const conversationIds = currentKillSwitch?.conversationIds ?? [];
    const wasBlockedBefore = conversationIds.includes(conversationId);

    switch (operation) {
      case "block": {
        if (wasBlockedBefore) {
          return new Ok({
            wasUpdated: false,
          });
        }

        const metadata = {
          ...(this.metadata ?? {}),
          [WorkspaceResource.KILL_SWITCH_METADATA_KEY]: {
            conversationIds: [...conversationIds, conversationId],
          },
        };
        const updateResult = await WorkspaceResource.updateMetadata(
          this.id,
          metadata
        );
        if (updateResult.isErr()) {
          return new Err(updateResult.error);
        }

        await terminateAllAgentLoopWorkflowsForConversation(conversationId);

        return new Ok({ wasUpdated: true });
      }

      case "unblock": {
        if (!wasBlockedBefore) {
          return new Ok({
            wasUpdated: false,
          });
        }

        const updatedConversationIds = conversationIds.filter(
          (cId) => cId !== conversationId
        );
        const metadata: Record<string, string | number | boolean | object> = {
          ...(this.metadata ?? {}),
        };
        if (updatedConversationIds.length === 0) {
          delete metadata[WorkspaceResource.KILL_SWITCH_METADATA_KEY];
        } else {
          metadata[WorkspaceResource.KILL_SWITCH_METADATA_KEY] = {
            conversationIds: updatedConversationIds,
          };
        }
        const updateResult = await WorkspaceResource.updateMetadata(
          this.id,
          metadata
        );
        if (updateResult.isErr()) {
          return new Err(updateResult.error);
        }

        return new Ok({ wasUpdated: true });
      }
    }
  }

  async updateWorkspaceKillSwitch({
    operation,
  }: {
    operation: WorkspaceKillSwitchOperation;
  }): Promise<Result<UpdateWorkspaceKillSwitchResult, Error>> {
    const currentKillSwitch =
      this.metadata?.[WorkspaceResource.KILL_SWITCH_METADATA_KEY];
    const isFullyBlocked =
      WorkspaceResource.isWorkspaceKillSwitchedForAllAPIs(currentKillSwitch);
    let metadata: Record<string, string | number | boolean | object>;

    switch (operation) {
      case "block":
        if (isFullyBlocked) {
          return new Ok({
            wasUpdated: false,
          });
        }

        metadata = {
          ...(this.metadata ?? {}),
          [WorkspaceResource.KILL_SWITCH_METADATA_KEY]:
            WorkspaceResource.FULL_WORKSPACE_KILL_SWITCH_VALUE,
        };
        break;
      case "unblock":
        if (!isFullyBlocked) {
          return new Ok({
            wasUpdated: false,
          });
        }

        metadata = { ...(this.metadata ?? {}) };
        delete metadata[WorkspaceResource.KILL_SWITCH_METADATA_KEY];
        break;
      default:
        return assertNever(operation);
    }

    const updateResult = await WorkspaceResource.updateMetadata(
      this.id,
      metadata
    );
    if (updateResult.isErr()) {
      return new Err(updateResult.error);
    }

    return new Ok({
      wasUpdated: true,
    });
  }

  static async updateWorkOSOrganizationId(
    id: ModelId,
    workOSOrganizationId: string | null,
    transaction?: Transaction
  ): Promise<Result<void, Error>> {
    return this.updateByModelIdAndCheckExistence(
      id,
      { workOSOrganizationId },
      transaction
    );
  }

  static async disableSSOEnforcement(
    id: ModelId
  ): Promise<Result<void, Error>> {
    const workspace = await this.model.findOne({
      where: { id, ssoEnforced: true },
    });

    if (!workspace) {
      return new Err(new Error("SSO enforcement is already disabled."));
    }

    const workspaceResource = new this(this.model, workspace.get());
    await workspaceResource.update({ ssoEnforced: false });

    return new Ok(undefined);
  }

  /**
   * Plan limit overrides
   *
   * A workspace has at most one override row, and callers only ever need its
   * values — never a row identity — so these statics return plain
   * {@link PlanLimitOverride} objects.
   */

  /**
   * Returns the plan-limit overrides for a workspace, or `null` when the
   * workspace has none. Used by `SubscriptionResource` when resolving the plan.
   */
  static async fetchPlanLimitOverride(
    workspaceModelId: ModelId,
    transaction?: Transaction
  ): Promise<PlanLimitOverride | null> {
    const row = await this.planLimitOverrideModel.findOne({
      where: { workspaceId: workspaceModelId },
      transaction,
    });

    return row ? renderPlanLimitOverride(row) : null;
  }

  /**
   * Batched variant of {@link fetchPlanLimitOverride}: returns one entry per
   * workspace that has overrides (workspaces without any are simply absent).
   */
  static async fetchPlanLimitOverridesByWorkspaceModelIds(
    workspaceModelIds: ModelId[],
    transaction?: Transaction
  ): Promise<Map<ModelId, PlanLimitOverride>> {
    if (workspaceModelIds.length === 0) {
      return new Map();
    }

    const rows = await this.planLimitOverrideModel.findAll({
      where: { workspaceId: workspaceModelIds },
      transaction,
      // WORKSPACE_ISOLATION_BYPASS: Plans are resolved for several workspaces at
      // once (`SubscriptionResource.fetchActiveByWorkspacesModelId`); the query
      // is scoped to exactly the requested workspaces.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    return new Map(
      rows.map((row) => [row.workspaceId, renderPlanLimitOverride(row)])
    );
  }

  /**
   * Sets the overrides for a workspace. Fields set to `null` are cleared, so the
   * workspace falls back to its plan value. When no override remains, the row is
   * deleted rather than kept fully null. Rejects out-of-range limits.
   *
   * The caller is responsible for invalidating the subscription cache — see
   * `setWorkspacePlanLimitOverrides`, which is the entry point to use.
   */
  static async upsertPlanLimitOverride(
    workspaceModelId: ModelId,
    override: PlanLimitOverride
  ): Promise<Result<undefined, Error>> {
    const validation = validatePlanLimitOverride(override);
    if (validation.isErr()) {
      return validation;
    }

    if (!hasAnyPlanLimitOverride(override)) {
      await this.planLimitOverrideModel.destroy({
        where: { workspaceId: workspaceModelId },
      });
      return new Ok(undefined);
    }

    const existing = await this.planLimitOverrideModel.findOne({
      where: { workspaceId: workspaceModelId },
    });

    if (existing) {
      await existing.update(override);
    } else {
      await this.planLimitOverrideModel.create({
        ...override,
        workspaceId: workspaceModelId,
      });
    }

    return new Ok(undefined);
  }

  static async deleteAllPlanLimitOverridesForWorkspace(
    workspaceModelId: ModelId,
    transaction?: Transaction
  ): Promise<void> {
    await this.planLimitOverrideModel.destroy({
      where: { workspaceId: workspaceModelId },
      transaction,
    });
  }

  /**
   * Getters
   */

  get canShareInteractiveContentPublicly(): boolean {
    return this.sharingPolicy === "all_scopes";
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<number | undefined, Error>> {
    try {
      const deletedCount = await this.model.destroy({
        where: { id: this.blob.id },
        transaction,
      });
      await WorkspaceResource.store.invalidateBlob(this.blob, transaction);
      return new Ok(deletedCount);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  toLogJSON(): ResourceLogJSON {
    return {
      sId: this.blob.sId,
    };
  }

  static async updateByModelIdAndCheckExistence(
    id: ModelId,
    updateValues: ResourceUpdateBlob<WorkspaceModel>,
    transaction?: Transaction
  ): Promise<Result<void, Error>> {
    if (updateValues.conversationsRetentionDays !== undefined) {
      const retentionDays = updateValues.conversationsRetentionDays;

      if (
        retentionDays !== null &&
        !isValidConversationsRetentionDays(retentionDays)
      ) {
        return new Err(
          new Error(
            `Conversation retention must be null or at least ${CONVERSATIONS_RETENTION_MIN_DAYS} day.`
          )
        );
      }
    }

    const workspace = await this.model.findOne({
      where: { id },
      transaction,
    });

    if (!workspace) {
      return new Err(new Error("Workspace not found."));
    }

    const workspaceResource = new this(this.model, workspace.get());
    await workspaceResource.update(updateValues, transaction);

    return new Ok(undefined);
  }
}
