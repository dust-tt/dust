import type { Authenticator } from "@app/lib/auth";
import type { SkillConfigurationModel } from "@app/lib/models/skill";
import {
  SkillFileAttachmentModel,
  SkillMCPServerConfigurationModel,
  SkillVersionModel,
} from "@app/lib/models/skill";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { ModelId } from "@app/types/shared/model_id";
import type { CreationAttributes, Transaction, WhereOptions } from "sequelize";

type SkillVersionCreationAttributes =
  CreationAttributes<SkillConfigurationModel> & {
    skillConfigurationId: ModelId;
    version: number;
    mcpServerViewIds: ModelId[];
    fileAttachmentIds: ModelId[];
  };

export function isSkillResourceWithVersion(
  skill: SkillResource
): skill is SkillResource & { version: number } {
  return skill.version !== null;
}

export async function saveVersion(
  auth: Authenticator,
  skill: SkillResource,
  { transaction }: { transaction?: Transaction } = {}
): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();

  // Fetch current MCP server configuration IDs for this skill.
  const mcpServerConfigurations =
    await SkillMCPServerConfigurationModel.findAll({
      where: {
        workspaceId: workspace.id,
        skillConfigurationId: skill.id,
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
      skillConfigurationId: skill.id,
    },
    transaction,
  });

  const fileAttachmentIds = fileAttachments.map((a) => a.fileId);

  // Calculate the next version number by counting existing versions.
  const where: WhereOptions<SkillVersionModel> = {
    workspaceId: skill.workspaceId,
    skillConfigurationId: skill.id,
  };

  const existingVersionsCount = await SkillVersionModel.count({
    where,
    transaction,
  });

  const versionNumber = existingVersionsCount + 1;

  // Create a new version entry with the current state.
  const versionData: SkillVersionCreationAttributes = {
    workspaceId: skill.workspaceId,
    skillConfigurationId: skill.id,
    version: versionNumber,
    status: skill.status,
    name: skill.name,
    agentFacingDescription: skill.agentFacingDescription,
    userFacingDescription: skill.userFacingDescription,
    instructions: skill.instructions,
    instructionsHtml: skill.instructionsHtml,
    requestedSpaceIds: skill.requestedSpaceIds,
    editedBy: skill.editedBy,
    mcpServerViewIds,
    fileAttachmentIds,
    source: skill.source,
    sourceMetadata: skill.sourceMetadata,
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
    isDefault: skill.isDefault,
  };

  await SkillVersionModel.create(versionData, {
    transaction,
  });
}
