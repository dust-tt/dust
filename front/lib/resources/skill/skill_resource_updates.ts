import type { Authenticator } from "@app/lib/auth";
import type { SkillConfigurationModel } from "@app/lib/models/skill";
import {
  SkillDataSourceConfigurationModel,
  SkillFileAttachmentModel,
  SkillMCPServerConfigurationModel,
  SkillVersionModel,
} from "@app/lib/models/skill";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResourceWithAgents } from "@app/lib/resources/skill/skill_resource_agents";
import type { SkillAttachedKnowledge } from "@app/lib/resources/skill/types";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type {
  SkillReinforcementMode,
  SkillSourceMetadata,
  SkillSourceType,
  SkillStatus,
} from "@app/types/assistant/skill_configuration";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import assert from "assert";
import isEqual from "lodash/isEqual";
import uniq from "lodash/uniq";
import type { CreationAttributes, Transaction, WhereOptions } from "sequelize";
import { Op } from "sequelize";

type SkillVersionCreationAttributes =
  CreationAttributes<SkillConfigurationModel> & {
    skillConfigurationId: ModelId;
    version: number;
    mcpServerViewIds: ModelId[];
    fileAttachmentIds: ModelId[];
  };

/**
 * Layer of the SkillResource inheritance chain owning skill updates: the
 * update flow itself, version snapshots, and the sync of tools, attached
 * knowledge and file attachments.
 */
export abstract class SkillResourceWithUpdates extends SkillResourceWithAgents {
  /**
   * Get attached knowledge from the skill's data source configurations.
   * Requires data source views to be fetched first.
   */
  async getAttachedKnowledge(
    auth: Authenticator
  ): Promise<SkillAttachedKnowledge[]> {
    if (this.dataSourceConfigurations.length === 0) {
      return [];
    }

    const dataSourceViewIds = uniq(
      this.dataSourceConfigurations.map((c) => c.dataSourceViewId)
    );

    const dataSourceViews = await DataSourceViewResource.fetchByModelIds(
      auth,
      dataSourceViewIds
    );

    const dataSourceViewMap = new Map(dataSourceViews.map((v) => [v.id, v]));

    const attachedKnowledge: SkillAttachedKnowledge[] = [];

    for (const config of this.dataSourceConfigurations) {
      const dataSourceView = dataSourceViewMap.get(config.dataSourceViewId);
      if (dataSourceView) {
        for (const nodeId of config.parentsIn) {
          attachedKnowledge.push({
            dataSourceView,
            nodeId,
          });
        }
      }
    }

    return attachedKnowledge;
  }

  /**
   * Compute the requestedSpaceIds from MCP server views and attached knowledge.
   * This is the source of truth for which spaces a skill needs access to.
   */
  static async computeRequestedSpaceIds(
    auth: Authenticator,
    {
      mcpServerViews,
      attachedKnowledge,
    }: {
      mcpServerViews: MCPServerViewResource[];
      attachedKnowledge: SkillAttachedKnowledge[];
    }
  ): Promise<ModelId[]> {
    const mcpServerViewIds = mcpServerViews.map((v) => v.sId);
    const spaceIdsFromMcpServerViews =
      await MCPServerViewResource.listSpaceRequirementsByIds(
        auth,
        mcpServerViewIds
      );

    const spaceIdsFromAttachedKnowledge = attachedKnowledge.map(
      (k) => k.dataSourceView.space.id
    );

    return uniq([
      ...spaceIdsFromMcpServerViews,
      ...spaceIdsFromAttachedKnowledge,
    ]);
  }

  static computeDataSourceConfigurationChanges(
    owner: LightWorkspaceType,
    {
      attachedKnowledge,
      existingConfigurations,
      skillConfigurationId,
    }: {
      attachedKnowledge: SkillAttachedKnowledge[];
      existingConfigurations: SkillDataSourceConfigurationModel[];
      skillConfigurationId: ModelId;
    }
  ): {
    toDelete: SkillDataSourceConfigurationModel[];
    toUpsert: CreationAttributes<SkillDataSourceConfigurationModel>[];
  } {
    // Group attached knowledge by data source view ID with all node IDs in parentsIn.
    const desiredConfigsByDataSourceViewId = attachedKnowledge.reduce<
      Record<
        ModelId,
        {
          dataSourceId: ModelId;
          dataSourceViewId: ModelId;
          parentsIn: string[];
        }
      >
    >((acc, k) => {
      const key = k.dataSourceView.id;

      acc[key] ??= {
        dataSourceId: k.dataSourceView.dataSource.id,
        dataSourceViewId: k.dataSourceView.id,
        parentsIn: [],
      };

      // Add nodeId to parentsIn if not already present.
      if (!acc[key].parentsIn.includes(k.nodeId)) {
        acc[key].parentsIn.push(k.nodeId);
      }

      return acc;
    }, {});

    const toDelete: SkillDataSourceConfigurationModel[] = [];
    const toUpsert: CreationAttributes<SkillDataSourceConfigurationModel>[] =
      [];

    // Track which dataSourceViewIds need to be recreated.
    const toRecreate = new Set<ModelId>();

    // Process existing configurations.
    for (const existingConfig of existingConfigurations) {
      const desiredConfig =
        desiredConfigsByDataSourceViewId[existingConfig.dataSourceViewId];

      if (!desiredConfig) {
        toDelete.push(existingConfig);
      } else {
        const desiredParentsIn = [...desiredConfig.parentsIn].sort();
        const existingParentsInSorted = [...existingConfig.parentsIn].sort();

        if (!isEqual(desiredParentsIn, existingParentsInSorted)) {
          toDelete.push(existingConfig);
          toRecreate.add(existingConfig.dataSourceViewId);
        }
      }
    }

    // Create new or changed configurations.
    for (const desiredConfig of Object.values(
      desiredConfigsByDataSourceViewId
    )) {
      const hasExisting = existingConfigurations.some(
        (existing) =>
          existing.dataSourceViewId === desiredConfig.dataSourceViewId
      );

      if (!hasExisting || toRecreate.has(desiredConfig.dataSourceViewId)) {
        toUpsert.push({
          ...desiredConfig,
          skillConfigurationId,
          workspaceId: owner.id,
        });
      }
    }

    return { toDelete, toUpsert };
  }

  protected async setAttachedKnowledge(
    auth: Authenticator,
    {
      attachedKnowledge,
    }: {
      attachedKnowledge: SkillAttachedKnowledge[];
    },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    assert(
      this.canWrite(auth),
      "User does not have permission to update this skill."
    );

    const workspace = auth.getNonNullableWorkspace();

    // Fetch existing configurations for this skill.
    const existingConfigurations =
      await SkillDataSourceConfigurationModel.findAll({
        where: {
          skillConfigurationId: this.id,
          workspaceId: workspace.id,
        },
        transaction,
      });

    const { toDelete, toUpsert } =
      SkillResourceWithUpdates.computeDataSourceConfigurationChanges(
        workspace,
        {
          attachedKnowledge,
          existingConfigurations,
          skillConfigurationId: this.id,
        }
      );

    // Delete configurations that are no longer needed.
    for (const config of toDelete) {
      await config.destroy({ transaction });
    }

    // Create new configurations. The diff logic already handles deleting changed ones.
    if (toUpsert.length > 0) {
      await SkillDataSourceConfigurationModel.bulkCreate(toUpsert, {
        transaction,
      });
    }
  }

  /**
   * Efficiently updates MCP server view associations by computing the diff and only
   * deleting/creating what changed.
   */
  protected async updateMCPServerViews(
    auth: Authenticator,
    mcpServerViews: MCPServerViewResource[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();

    const existingConfigs = await SkillMCPServerConfigurationModel.findAll({
      where: {
        workspaceId: workspace.id,
        skillConfigurationId: this.id,
      },
      transaction,
    });

    const existingMcpServerViewIds = new Set(
      existingConfigs.map((config) => config.mcpServerViewId)
    );
    const mcpServerViewIds = new Set(mcpServerViews.map((msv) => msv.id));

    // Delete removed tools.
    const idsToDelete = existingConfigs
      .filter((config) => !mcpServerViewIds.has(config.mcpServerViewId))
      .map((config) => config.id);
    if (idsToDelete.length > 0) {
      await SkillMCPServerConfigurationModel.destroy({
        where: {
          id: { [Op.in]: idsToDelete },
          workspaceId: workspace.id,
        },
        transaction,
      });
    }

    // Create new tools.
    const toCreate = mcpServerViews.filter(
      (msv) => !existingMcpServerViewIds.has(msv.id)
    );
    if (toCreate.length > 0) {
      await SkillMCPServerConfigurationModel.bulkCreate(
        toCreate.map((mcpServerView) => ({
          workspaceId: workspace.id,
          skillConfigurationId: this.id,
          mcpServerViewId: mcpServerView.id,
        })),
        { transaction }
      );
    }

    // Update instance to avoid stale data.
    this._mcpServerConfigurations = mcpServerViews.map((view) => ({
      view,
    }));
  }

  protected async setFileAttachments(
    auth: Authenticator,
    fileAttachments: FileResource[]
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();

    const existingAttachments = await SkillFileAttachmentModel.findAll({
      where: {
        skillConfigurationId: this.id,
        workspaceId: workspace.id,
      },
    });

    const desiredFileModelIds = new Set(fileAttachments.map((f) => f.id));
    const existingFileModelIds = new Set(
      existingAttachments.map((a) => a.fileId)
    );

    // Remove join table rows for detached files (keep the files for version history).
    const toRemove = existingAttachments.filter(
      (a) => !desiredFileModelIds.has(a.fileId)
    );
    if (toRemove.length > 0) {
      await SkillFileAttachmentModel.destroy({
        where: {
          id: { [Op.in]: toRemove.map((a) => a.id) },
          workspaceId: workspace.id,
        },
      });
    }

    // Create new attachments.
    const toCreate = fileAttachments.filter(
      (f) => !existingFileModelIds.has(f.id)
    );
    if (toCreate.length > 0) {
      await SkillFileAttachmentModel.bulkCreate(
        toCreate.map((file) => ({
          workspaceId: workspace.id,
          skillConfigurationId: this.id,
          fileId: file.id,
          fileName: file.fileName,
        }))
      );
    }

    // Update instance to avoid stale data.
    this.fileAttachments = fileAttachments;
  }

  protected async saveVersion(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();

    // Fetch current MCP server configuration IDs for this skill.
    const mcpServerConfigurations =
      await SkillMCPServerConfigurationModel.findAll({
        where: {
          workspaceId: workspace.id,
          skillConfigurationId: this.id,
        },
        transaction,
      });

    const mcpServerViewIds = mcpServerConfigurations.map(
      (config) => config.mcpServerViewId
    );

    // Fetch current file attachment IDs for this skill.
    const fileAttachments = await SkillFileAttachmentModel.findAll({
      where: {
        workspaceId: workspace.id,
        skillConfigurationId: this.id,
      },
      transaction,
    });

    const fileAttachmentIds = fileAttachments.map((a) => a.fileId);

    // Calculate the next version number by counting existing versions.
    const where: WhereOptions<SkillVersionModel> = {
      workspaceId: this.workspaceId,
      skillConfigurationId: this.id,
    };

    const existingVersionsCount = await SkillVersionModel.count({
      where,
      transaction,
    });

    const versionNumber = existingVersionsCount + 1;

    // Create a new version entry with the current state.
    const versionData: SkillVersionCreationAttributes = {
      workspaceId: this.workspaceId,
      skillConfigurationId: this.id,
      version: versionNumber,
      status: this.status,
      name: this.name,
      agentFacingDescription: this.agentFacingDescription,
      userFacingDescription: this.userFacingDescription,
      instructions: this.instructions,
      instructionsHtml: this.instructionsHtml,
      requestedSpaceIds: this.requestedSpaceIds,
      editedBy: this.editedBy,
      mcpServerViewIds,
      fileAttachmentIds,
      source: this.source,
      sourceMetadata: this.sourceMetadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isDefault: this.isDefault,
    };

    await SkillVersionModel.create(versionData, {
      transaction,
    });
  }

  async updateSkill(
    auth: Authenticator,
    {
      agentFacingDescription,
      attachedKnowledge,
      fileAttachments,
      icon,
      instructions,
      instructionsHtml,
      isDefault,
      mcpServerViews,
      name,
      reinforcement,
      requestedSpaceIds,
      source,
      sourceMetadata,
      status,
      userFacingDescription,
    }: {
      agentFacingDescription: string;
      attachedKnowledge: SkillAttachedKnowledge[];
      fileAttachments?: FileResource[];
      icon: string | null;
      instructions: string;
      instructionsHtml?: string | null;
      isDefault?: boolean;
      mcpServerViews: MCPServerViewResource[];
      name: string;
      reinforcement?: SkillReinforcementMode;
      requestedSpaceIds: ModelId[];
      source?: SkillSourceType;
      sourceMetadata?: SkillSourceMetadata;
      status?: SkillStatus;
      userFacingDescription: string;
    }
  ): Promise<void> {
    assert(this.canWrite(auth), "User is not authorized to update this skill");

    // Snapshot the previous name and icon before updating to detect changes below.
    const previousName = this.name;
    const previousIcon = this.icon;
    const previousStatus = this.status;

    await withTransaction(async (transaction) => {
      // Save the current version before updating.
      await this.saveVersion(auth, { transaction });

      // Snapshot the previous requested space IDs before updating.
      const previousRequestedSpaceIds = [...this.requestedSpaceIds];
      const previousRequestedSpaceIdsSet = new Set(previousRequestedSpaceIds);
      const requestedSpaceIdsChanged =
        previousRequestedSpaceIds.length !== requestedSpaceIds.length ||
        requestedSpaceIds.some(
          (spaceId) => !previousRequestedSpaceIdsSet.has(spaceId)
        );
      const statusChanged = status !== undefined && previousStatus !== status;

      const editedBy = auth.user()?.id;
      await this.update(
        {
          name,
          agentFacingDescription,
          userFacingDescription,
          instructions,
          ...(instructionsHtml !== undefined ? { instructionsHtml } : {}),
          icon,
          requestedSpaceIds,
          editedBy,
          ...(status ? { status } : {}),
          ...(source ? { source } : {}),
          ...(sourceMetadata ? { sourceMetadata } : {}),
          ...(isDefault !== undefined ? { isDefault } : {}),
          ...(reinforcement !== undefined ? { reinforcement } : {}),
        },
        transaction
      );

      await this.normalizeSkillReferenceTags(auth, { transaction });
      await this.syncSkillReferences(auth, { transaction });

      if (
        name !== previousName ||
        icon !== previousIcon ||
        requestedSpaceIdsChanged ||
        statusChanged
      ) {
        await this.propagateReferenceUpdatesToParentSkills(
          auth,
          {
            icon,
            name,
            requestedSpaceIds,
            status: status ?? this.status,
          },
          { transaction }
        );
      }

      await this.updateMCPServerViews(auth, mcpServerViews, { transaction });

      await this.setAttachedKnowledge(
        auth,
        {
          attachedKnowledge,
        },
        { transaction }
      );

      await this.updateActiveAgentsRequirements(
        auth,
        { previousRequestedSpaceIds },
        { transaction }
      );
    });

    if (fileAttachments) {
      await this.setFileAttachments(auth, fileAttachments);
    }

    await this.upsertCurrentUserAsEditor(auth);
  }

  async updateReinforcement(
    reinforcement: SkillReinforcementMode
  ): Promise<void> {
    await this.update({ reinforcement });
  }

  async updateSelfImprovementLock(selfImprovementLock: boolean): Promise<void> {
    await this.update({ selfImprovementLock });
  }

  async updateSelfImprovementCostsCap(
    selfImprovementCostsCapMicroUsd: number | null
  ): Promise<void> {
    await this.update({ selfImprovementCostsCapMicroUsd });
  }

  async updateSelfImprovementCostsCapAwuCredits(
    selfImprovementCostsCapAwuCredits: number | null
  ): Promise<void> {
    await this.update({ selfImprovementCostsCapAwuCredits });
  }

  async recordReinforcementAnalysisCompletion(): Promise<void> {
    await this.update({ lastReinforcementAnalysisAt: new Date() });
  }
}
