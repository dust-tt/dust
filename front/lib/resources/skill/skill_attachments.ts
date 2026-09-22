import type { Authenticator } from "@app/lib/auth";
import {
  SkillDataSourceConfigurationModel,
  SkillFileAttachmentModel,
  SkillMCPServerConfigurationModel,
} from "@app/lib/models/skill";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillAttachedKnowledge } from "@app/lib/resources/skill/types";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import assert from "assert";
import isEqual from "lodash/isEqual";
import uniq from "lodash/uniq";
import type { CreationAttributes, Transaction } from "sequelize";
import { Op } from "sequelize";

export async function getAttachedKnowledge(
  skillResource: SkillResource,
  auth: Authenticator
): Promise<SkillAttachedKnowledge[]> {
  if (skillResource.dataSourceConfigurations.length === 0) {
    return [];
  }

  const dataSourceViewIds = uniq(
    skillResource.dataSourceConfigurations.map((c) => c.dataSourceViewId)
  );

  const dataSourceViews = await DataSourceViewResource.fetchByModelIds(
    auth,
    dataSourceViewIds
  );

  const dataSourceViewMap = new Map(dataSourceViews.map((v) => [v.id, v]));

  const attachedKnowledge: SkillAttachedKnowledge[] = [];

  for (const config of skillResource.dataSourceConfigurations) {
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

export async function computeToolAndKnowledgeSpaceIds(
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

/**
 * Efficiently updates MCP server view associations by computing the diff and only
 * deleting/creating what changed.
 */
export async function updateMCPServerViews(
  skillResource: SkillResource,
  auth: Authenticator,
  mcpServerViews: MCPServerViewResource[],
  { transaction }: { transaction?: Transaction } = {}
): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();

  const existingConfigs = await SkillMCPServerConfigurationModel.findAll({
    where: {
      workspaceId: workspace.id,
      skillConfigurationId: skillResource.id,
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
        skillConfigurationId: skillResource.id,
        mcpServerViewId: mcpServerView.id,
      })),
      { transaction }
    );
  }
}

export function computeDataSourceConfigurationChanges(
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
  const toUpsert: CreationAttributes<SkillDataSourceConfigurationModel>[] = [];

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
  for (const desiredConfig of Object.values(desiredConfigsByDataSourceViewId)) {
    const hasExisting = existingConfigurations.some(
      (existing) => existing.dataSourceViewId === desiredConfig.dataSourceViewId
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

export async function setAttachedKnowledge(
  resourceClass: typeof SkillResource,
  skillResource: SkillResource,
  auth: Authenticator,
  {
    attachedKnowledge,
  }: {
    attachedKnowledge: SkillAttachedKnowledge[];
  },
  { transaction }: { transaction?: Transaction } = {}
): Promise<void> {
  assert(
    skillResource.canWrite(auth),
    "User does not have permission to update this skill."
  );

  const workspace = auth.getNonNullableWorkspace();

  // Fetch existing configurations for this skill.
  const existingConfigurations =
    await SkillDataSourceConfigurationModel.findAll({
      where: {
        skillConfigurationId: skillResource.id,
        workspaceId: workspace.id,
      },
      transaction,
    });

  const { toDelete, toUpsert } =
    resourceClass.computeDataSourceConfigurationChanges(workspace, {
      attachedKnowledge,
      existingConfigurations,
      skillConfigurationId: skillResource.id,
    });

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

export async function setFileAttachments(
  skillResource: SkillResource,
  auth: Authenticator,
  fileAttachments: FileResource[]
): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();

  const existingAttachments = await SkillFileAttachmentModel.findAll({
    where: {
      skillConfigurationId: skillResource.id,
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
        skillConfigurationId: skillResource.id,
        fileId: file.id,
        fileName: file.fileName,
      }))
    );
  }
}

export async function computeRequestedSpaceIds(
  resourceClass: typeof SkillResource,
  auth: Authenticator,
  {
    attachedKnowledge,
    excludedSkillId,
    instructions,
    manuallyRequestedSpaceIds,
    mcpServerViews,
  }: {
    attachedKnowledge: SkillAttachedKnowledge[];
    excludedSkillId?: string;
    instructions: string;
    manuallyRequestedSpaceIds: ModelId[];
    mcpServerViews: MCPServerViewResource[];
  }
): Promise<ModelId[]> {
  const toolAndKnowledgeSpaceIds =
    await resourceClass.computeToolAndKnowledgeSpaceIds(auth, {
      mcpServerViews,
      attachedKnowledge,
    });
  const referencedSkillSpaceIds =
    await resourceClass.listReferencedSkillSpaceIds(
      auth,
      instructions,
      excludedSkillId
    );
  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);

  return uniq([
    ...toolAndKnowledgeSpaceIds, // Tools and attached knowledge.
    ...referencedSkillSpaceIds, // Nested skills.
    ...manuallyRequestedSpaceIds, // Picked by hand.
    globalSpace.id, // Always required.
  ]);
}
