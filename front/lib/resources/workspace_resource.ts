import {
  listWorkOSOrganizationsWithDomain,
  removeWorkOSOrganizationDomain,
  removeWorkOSOrganizationDomainFromOrganization,
} from "@app/lib/api/workos/organization_primitives";
import type { Authenticator } from "@app/lib/auth";
import type { ResourceLogJSON } from "@app/lib/resources/base_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ModelProviderIdType } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { cacheWithRedis, invalidateCacheWithRedis } from "@app/lib/utils/cache";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { EmbeddingProviderIdType } from "@app/types/assistant/models/types";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { WorkspaceSegmentationType } from "@app/types/user";
import type { WorkspaceDomain } from "@app/types/workspace";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

const WORKSPACE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// We use this to avoid accidentaly inflating the cache footprint
// Add new attributes with caution
type CachedWorkspaceData = {
  id: ModelId;
  sId: string;
  name: string;
  description: string | null;
  segmentation: WorkspaceSegmentationType | null;
  ssoEnforced: boolean;
  workOSOrganizationId: string | null;
  whiteListedProviders: ModelProviderIdType[] | null;
  defaultEmbeddingProvider: EmbeddingProviderIdType | null;
  metadata: Record<string, string | number | boolean | object> | null;
  conversationsRetentionDays: number | null;
  createdAt: number;
  updatedAt: number;
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface WorkspaceResource
  extends ReadonlyAttributesType<WorkspaceModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class WorkspaceResource extends BaseResource<WorkspaceModel> {
  static model: ModelStatic<WorkspaceModel> = WorkspaceModel;
  private static workspaceDomainModel: ModelStaticWorkspaceAware<WorkspaceHasDomainModel> =
    WorkspaceHasDomainModel;

  readonly blob: Attributes<WorkspaceModel>;

  constructor(
    model: ModelStatic<WorkspaceModel>,
    blob: Attributes<WorkspaceModel>
  ) {
    super(WorkspaceModel, blob);
    this.blob = blob;
  }

  static readonly workspaceCacheKeyResolver = (wId: string) =>
    `workspace:sid:${wId}`;

  private static async _fetchByIdUncached(
    wId: string
  ): Promise<CachedWorkspaceData | null> {
    const workspace = await WorkspaceModel.findOne({
      where: { sId: wId },
    });
    if (!workspace) {
      return null;
    }
    return {
      id: workspace.id,
      sId: workspace.sId,
      name: workspace.name,
      description: workspace.description,
      segmentation: workspace.segmentation,
      ssoEnforced: workspace.ssoEnforced ?? false,
      workOSOrganizationId: workspace.workOSOrganizationId,
      whiteListedProviders: workspace.whiteListedProviders,
      defaultEmbeddingProvider: workspace.defaultEmbeddingProvider,
      metadata: workspace.metadata,
      conversationsRetentionDays: workspace.conversationsRetentionDays,
      createdAt: workspace.createdAt.getTime(),
      updatedAt: workspace.updatedAt.getTime(),
    };
  }

  private static fetchByIdCached = cacheWithRedis(
    WorkspaceResource._fetchByIdUncached,
    WorkspaceResource.workspaceCacheKeyResolver,
    { ttlMs: WORKSPACE_CACHE_TTL_MS }
  );

  private static invalidateWorkspaceCache = invalidateCacheWithRedis(
    WorkspaceResource._fetchByIdUncached,
    WorkspaceResource.workspaceCacheKeyResolver
  );

  private static fromCachedData(data: CachedWorkspaceData): WorkspaceResource {
    const blob: Attributes<WorkspaceModel> = {
      id: data.id,
      sId: data.sId,
      name: data.name,
      description: data.description,
      segmentation: data.segmentation,
      ssoEnforced: data.ssoEnforced,
      workOSOrganizationId: data.workOSOrganizationId,
      whiteListedProviders: data.whiteListedProviders,
      defaultEmbeddingProvider: data.defaultEmbeddingProvider,
      metadata: data.metadata,
      conversationsRetentionDays: data.conversationsRetentionDays,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    };
    return new WorkspaceResource(WorkspaceModel, blob);
  }

  protected override async update(
    blob: Partial<Attributes<WorkspaceModel>>,
    transaction?: Transaction
  ): Promise<[affectedCount: number]> {
    const result = await super.update(blob, transaction);
    await WorkspaceResource.invalidateWorkspaceCache(this.sId);
    return result;
  }

  static async makeNew(
    blob: CreationAttributes<WorkspaceModel>
  ): Promise<WorkspaceResource> {
    const workspace = await this.model.create(blob);
    const workspaceResource = new this(this.model, workspace.get());

    await WorkspaceResource.invalidateWorkspaceCache(workspaceResource.sId);

    return workspaceResource;
  }

  static async fetchById(
    wId: string,
    transaction?: Transaction
  ): Promise<WorkspaceResource | null> {
    if (transaction) {
      const workspace = await this.model.findOne({
        where: { sId: wId },
        transaction,
      });
      return workspace ? new this(this.model, workspace.get()) : null;
    }

    const cached = await this.fetchByIdCached(wId);
    if (!cached) {
      return null;
    }
    return this.fromCachedData(cached);
  }

  static async fetchByName(name: string): Promise<WorkspaceResource | null> {
    const workspace = await this.model.findOne({
      where: { name },
    });
    return workspace ? new this(this.model, workspace.get()) : null;
  }

  static async fetchByModelIds(ids: ModelId[]): Promise<WorkspaceResource[]> {
    const workspaces = await this.model.findAll({
      where: {
        id: {
          [Op.in]: ids,
        },
      },
    });
    return workspaces.map((workspace) => new this(this.model, workspace.get()));
  }

  static async fetchByIds(wIds: string[]): Promise<WorkspaceResource[]> {
    const workspaces = await this.model.findAll({
      where: {
        sId: {
          [Op.in]: wIds,
        },
      },
    });
    return workspaces.map((workspace) => new this(this.model, workspace.get()));
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

    const workspace = await this.model.findOne({
      where: { id: workspaceDomain.workspaceId },
    });

    if (!workspace) {
      return null;
    }

    return {
      workspace: new this(this.model, workspace.get()),
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

  static async fetchByWorkOSOrganizationId(
    workOSOrganizationId: string
  ): Promise<WorkspaceResource | null> {
    const workspace = await this.model.findOne({
      where: { workOSOrganizationId },
    });
    return workspace ? new this(this.model, workspace.get()) : null;
  }

  static async listAll(order?: "ASC" | "DESC"): Promise<WorkspaceResource[]> {
    const workspaces = await this.model.findAll({
      ...(order && { order: [["id", order]] }),
    });
    return workspaces.map((workspace) => new this(this.model, workspace.get()));
  }

  static async listAllModelIds(order?: "ASC" | "DESC"): Promise<ModelId[]> {
    const workspaces = await this.model.findAll({
      attributes: ["id"],
      ...(order && { order: [["id", order]] }),
    });
    return workspaces.map((w) => w.id);
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

  async updateSegmentation(segmentation: WorkspaceSegmentationType) {
    return this.update({ segmentation });
  }

  async updateWorkspaceSettings(
    updateableAttributes: Partial<
      Pick<
        CreationAttributes<WorkspaceModel>,
        | "name"
        | "ssoEnforced"
        | "whiteListedProviders"
        | "defaultEmbeddingProvider"
        | "workOSOrganizationId"
        | "metadata"
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

  static async updateWorkOSOrganizationId(
    id: ModelId,
    workOSOrganizationId: string | null
  ): Promise<Result<void, Error>> {
    return this.updateByModelIdAndCheckExistence(id, { workOSOrganizationId });
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
   * Getters
   */

  get canShareInteractiveContentPublicly(): boolean {
    return this.blob.metadata?.allowContentCreationFileSharing !== false;
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
      await WorkspaceResource.invalidateWorkspaceCache(this.sId);
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
    updateValues: Partial<Attributes<WorkspaceModel>>
  ): Promise<Result<void, Error>> {
    const workspace = await this.model.findOne({
      where: { id },
    });

    if (!workspace) {
      return new Err(new Error("Workspace not found."));
    }

    const workspaceResource = new this(this.model, workspace.get());
    await workspaceResource.update(updateValues);

    return new Ok(undefined);
  }
}
