import { SkillVersionModel } from "@app/lib/models/skill";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";

export class SkillVersionFactory {
  static async create(
    skill: SkillResource,
    {
      mcpServerViews,
      version = 1,
    }: {
      mcpServerViews: MCPServerViewResource[];
      version?: number;
    }
  ) {
    const skillVersion = SkillVersionModel.build();

    skillVersion.workspaceId = skill.workspaceId;
    skillVersion.skillConfigurationId = skill.id;
    skillVersion.version = version;
    skillVersion.status = skill.status;
    skillVersion.name = skill.name;
    skillVersion.agentFacingDescription = skill.agentFacingDescription;
    skillVersion.userFacingDescription = skill.userFacingDescription;
    skillVersion.instructions = skill.instructions;
    skillVersion.requestedSpaceIds = skill.requestedSpaceIds;
    skillVersion.editedBy = skill.editedBy;
    skillVersion.mcpServerViewIds = mcpServerViews.map(
      (mcpServerView) => mcpServerView.id
    );
    skillVersion.fileAttachmentIds = [];
    skillVersion.source = skill.source;
    skillVersion.sourceMetadata = skill.sourceMetadata;
    skillVersion.createdAt = skill.createdAt;
    skillVersion.updatedAt = skill.updatedAt;
    skillVersion.isDefault = skill.isDefault;

    return skillVersion.save();
  }
}
