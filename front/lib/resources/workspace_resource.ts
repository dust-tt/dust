import type { Transaction } from "sequelize";
import type { Attributes, CreationAttributes, ModelStatic } from "sequelize";
import { Op } from "sequelize";

import {
  listWorkOSOrganizationsWithDomain,
  removeWorkOSOrganizationDomain,
} from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import type { ResourceLogJSON } from "@app/lib/resources/base_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type {
  ModelId,
  Result,
  WorkspaceDomain,
  WorkspaceSegmentationType,
} from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface WorkspaceResource extends ReadonlyAttributesType<WorkspaceModel> {}

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

  static async makeNew(
    blob: CreationAttributes<WorkspaceModel>
  ): Promise<WorkspaceResource> {
    const workspace = await this.model.create(blob);

    return new this(this.model, workspace.get());
  }

  static async fetchById(wId: string): Promise<WorkspaceResource | null> {
    const workspace = await this.model.findOne({
      where: {
        sId: wId,
      },
    });
    return workspace ? new this(this.model, workspace.get()) : null;
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
    const workspaces = await WorkspaceModel.findAll({
      where: {
        sId: {
          [Op.in]: wIds,
        },
      },
    });
    return workspaces.map((workspace) => new this(this.model, workspace.get()));
  }

  static async fetchByDomain(
    domain: string
  ): Promise<WorkspaceResource | null> {
    const workspaceDomain = await this.workspaceDomainModel.findOne({
      where: { domain },
      // WORKSPACE_ISOLATION_BYPASS: Use to search for existing workspaces by domain.
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    if (!workspaceDomain) {
      return null;
    }

    const workspace = await this.model.findOne({
      where: { id: workspaceDomain.workspaceId },
    });

    return workspace ? new this(this.model, workspace.get()) : null;
  }

  static async fetchByWorkOSOrganizationId(
    workOSOrganizationId: string
  ): Promise<WorkspaceResource | null> {
    const workspace = await this.model.findOne({
      where: { workOSOrganizationId },
    });
    return workspace ? new this(this.model, workspace.get()) : null;
  }

  static async listAll(): Promise<WorkspaceResource[]> {
    const workspaces = await this.model.findAll();
    return workspaces.map((workspace) => new this(this.model, workspace.get()));
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
            workspaceId: existingDomainInRegion.workspace.id,
          },
          "Dropping existing domain"
        );

        const domainWorkspace = await WorkspaceResource.fetchById(
          existingDomainInRegion.workspace.sId
        );

        if (!domainWorkspace) {
          return new Err(
            new Error(
              `Failed to fetch workspace ${existingDomainInRegion.workspace.sId} while dropping domain ${domain}`
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
            `Domain ${domain} already exists in workspace ${existingDomainInRegion.workspace.id}`
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
        return new Err(
          new Error(
            `Domain ${domain} already associated with organization ` +
              `${otherOrganizationWithDomain.id} - ${otherOrganizationWithDomain.metadata.region}`
          )
        );
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
    metadata: Record<string, string | number | boolean | object>
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
    const [affectedCount] = await WorkspaceModel.update(
      { ssoEnforced: false },
      {
        where: {
          id,
          ssoEnforced: true,
        },
      }
    );

    if (affectedCount === 0) {
      return new Err(new Error("SSO enforcement is already disabled."));
    }

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

  // Perform an update operation and check workspace existence.
  static async updateByModelIdAndCheckExistence(
    id: ModelId,
    updateValues: Partial<Attributes<WorkspaceModel>>
  ): Promise<Result<void, Error>> {
    const [affectedCount] = await WorkspaceModel.update(updateValues, {
      where: { id },
    });

    if (affectedCount === 0) {
      return new Err(new Error("Workspace not found."));
    }

    return new Ok(undefined);
  }
}
