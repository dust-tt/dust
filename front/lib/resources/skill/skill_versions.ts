import type { Authenticator } from "@app/lib/auth";
import type { SkillConfigurationModel } from "@app/lib/models/skill";
import {
  SkillFileAttachmentModel,
  SkillMCPServerConfigurationModel,
  SkillVersionModel,
} from "@app/lib/models/skill";
import { FileResource } from "@app/lib/resources/file_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillResourceFactory } from "@app/lib/resources/skill/types";
import type { ModelId } from "@app/types/shared/model_id";
import { removeNulls } from "@app/types/shared/utils/general";
import assert from "assert";
import groupBy from "lodash/groupBy";
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

function isSkillResourceWithVersion(
  skill: SkillResource
): skill is SkillResource & { version: number } {
  return skill.version !== null;
}

/**
 * Snapshot the current state of several skills as new version entries, with batched
 * queries (one per satellite table) instead of per-skill round trips.
 */
export async function bulkSaveVersions(
  auth: Authenticator,
  skills: SkillResource[],
  { transaction }: { transaction?: Transaction } = {}
): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();
  const skillIds = skills.map((skill) => skill.id);

  // Fetch current MCP server configuration IDs for all skills.
  const mcpServerConfigurations =
    await SkillMCPServerConfigurationModel.findAll({
      where: {
        workspaceId: workspace.id,
        skillConfigurationId: { [Op.in]: skillIds },
      },
      transaction,
    });
  const mcpServerConfigsBySkillId = groupBy(
    mcpServerConfigurations,
    "skillConfigurationId"
  );

  // Fetch current file attachment IDs for all skills.
  const fileAttachments = await SkillFileAttachmentModel.findAll({
    where: {
      workspaceId: workspace.id,
      skillConfigurationId: { [Op.in]: skillIds },
    },
    transaction,
  });
  const fileAttachmentsBySkillId = groupBy(
    fileAttachments,
    "skillConfigurationId"
  );

  // Compute the next version number per skill. Only (skillConfigurationId, version)
  // pairs are loaded; skills have a bounded number of versions.
  const versionWhere: WhereOptions<SkillVersionModel> = {
    workspaceId: workspace.id,
    skillConfigurationId: { [Op.in]: skillIds },
  };
  const versionRows = await SkillVersionModel.findAll({
    attributes: ["skillConfigurationId", "version"],
    where: versionWhere,
    transaction,
  });
  const maxVersionBySkillId = new Map<ModelId, number>();
  for (const row of versionRows) {
    const currentMax = maxVersionBySkillId.get(row.skillConfigurationId) ?? 0;
    if (row.version > currentMax) {
      maxVersionBySkillId.set(row.skillConfigurationId, row.version);
    }
  }

  // Create the new version entries with the current state of each skill.
  const versionData: SkillVersionCreationAttributes[] = skills.map((skill) => ({
    workspaceId: skill.workspaceId,
    skillConfigurationId: skill.id,
    version: (maxVersionBySkillId.get(skill.id) ?? 0) + 1,
    status: skill.status,
    name: skill.name,
    agentFacingDescription: skill.agentFacingDescription,
    userFacingDescription: skill.userFacingDescription,
    instructions: skill.instructions,
    instructionsHtml: skill.instructionsHtml,
    requestedSpaceIds: skill.requestedSpaceIds,
    manuallyRequestedSpaceIds: skill.manuallyRequestedSpaceIds,
    editedBy: skill.editedBy,
    mcpServerViewIds: (mcpServerConfigsBySkillId[skill.id] ?? []).map(
      (config) => config.mcpServerViewId
    ),
    fileAttachmentIds: (fileAttachmentsBySkillId[skill.id] ?? []).map(
      (attachment) => attachment.fileId
    ),
    source: skill.source,
    sourceMetadata: skill.sourceMetadata,
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
    availability: skill.availability,
  }));

  await SkillVersionModel.bulkCreate(versionData, {
    transaction,
  });
}

export async function listVersions(
  skillResource: SkillResource,
  createResource: SkillResourceFactory,
  auth: Authenticator
): Promise<(SkillResource & { version: number })[]> {
  const workspace = auth.getNonNullableWorkspace();

  // Fetch all historical versions from the skill_versions table.
  const where: WhereOptions<SkillVersionModel> = {
    workspaceId: workspace.id,
    skillConfigurationId: skillResource.id,
  };

  const versionModels = await SkillVersionModel.findAll({
    where,
  });

  // Sort application-side by version number DESC.
  const sortedVersionModels = versionModels.sort(
    (a, b) => b.version - a.version
  );

  // Build map to cache MCPServerViewResource instances.
  const allMcpServerViewIds = uniq(
    sortedVersionModels.flatMap((model) => model.mcpServerViewIds)
  );
  const allMcpServerViews = await MCPServerViewResource.fetchByModelIds(
    auth,
    allMcpServerViewIds,
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
  const mcpServerViewMap = new Map(
    allMcpServerViews.map((view) => [view.id, view])
  );

  // Build map to cache FileResource instances.
  const allFileAttachmentIds = uniq(
    sortedVersionModels.flatMap((model) => model.fileAttachmentIds)
  );
  const allFiles = await FileResource.fetchByModelIdsWithAuth(
    auth,
    allFileAttachmentIds
  );
  const fileMap = new Map(allFiles.map((file) => [file.id, file]));

  // Convert version models to SkillResource instances.
  return sortedVersionModels.map((versionModel) => {
    const mcpServerViews = removeNulls(
      versionModel.mcpServerViewIds.map((id) => mcpServerViewMap.get(id))
    );
    const fileAttachments = removeNulls(
      versionModel.fileAttachmentIds.map((id) => fileMap.get(id))
    );

    const skill = createResource(
      skillResource.model,
      {
        id: skillResource.id,
        workspaceId: workspace.id,
        editedBy: versionModel.editedBy,
        createdAt: versionModel.createdAt,
        updatedAt: versionModel.updatedAt,
        status: versionModel.status,
        name: versionModel.name,
        agentFacingDescription: versionModel.agentFacingDescription,
        userFacingDescription: versionModel.userFacingDescription,
        instructions: versionModel.instructions,
        instructionsHtml: versionModel.instructionsHtml,
        icon: versionModel.icon,
        requestedSpaceIds: versionModel.requestedSpaceIds,
        manuallyRequestedSpaceIds: versionModel.manuallyRequestedSpaceIds,
        source: versionModel.source,
        sourceMetadata: versionModel.sourceMetadata,
        availability: versionModel.availability,
        favoriteCount: skillResource.favoriteCount,
        reinforcement: "auto",
        lastReinforcementAnalysisAt: null,
        selfImprovementCostsCapMicroUsd:
          versionModel.selfImprovementCostsCapMicroUsd,
        selfImprovementCostsCapAwuCredits:
          versionModel.selfImprovementCostsCapAwuCredits,
        selfImprovementLock: versionModel.selfImprovementLock,
      },
      {
        // We ignore data source configurations for historical versions.
        // As when the user saves we re-compute those from the nodes.
        dataSourceConfigurations: [],
        fileAttachments,
        mcpServerConfigurations: mcpServerViews.map((view) => ({
          view,
        })),
        version: versionModel.version,
      }
    );
    assert(isSkillResourceWithVersion(skill));
    return skill;
  });
}
