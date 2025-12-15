import type { Authenticator } from "@app/lib/auth";
import { SkillVersionModel } from "@app/lib/models/skill";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import type { SkillConfigurationType } from "@app/types/assistant/skill_configuration";

/**
 * Get all versions of a single skill, including the current version.
 * Returns versions sorted by version number descending (newest first).
 */
export async function listSkillConfigurationVersions(
  auth: Authenticator,
  { skillId }: { skillId: string }
): Promise<SkillConfigurationType[]> {
  const workspace = auth.workspace();
  if (!workspace || !auth.isUser()) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  // Fetch the current skill configuration
  const currentSkill = await SkillResource.fetchById(auth, skillId);

  if (!currentSkill) {
    return [];
  }

  // Fetch all historical versions from skill_versions table
  const versionModels = await SkillVersionModel.findAll({
    where: {
      workspaceId: workspace.id,
      skillConfigurationId: currentSkill.id,
    },
    order: [["version", "DESC"]],
  });

  // Convert version models to SkillConfigurationType
  const historicalVersions: SkillConfigurationType[] = versionModels.map(
    (versionModel) => ({
      id: versionModel.id,
      sId: currentSkill.sId,
      createdAt: versionModel.createdAt?.getTime() ?? null,
      updatedAt: versionModel.updatedAt?.getTime() ?? null,
      versionAuthorId: versionModel.authorId,
      status: versionModel.status,
      name: versionModel.name,
      agentFacingDescription: versionModel.agentFacingDescription,
      userFacingDescription: versionModel.userFacingDescription,
      instructions: versionModel.instructions,
      icon: versionModel.icon,
      requestedSpaceIds: versionModel.requestedSpaceIds,
      // For historical versions, we use the stored mcpServerConfigurationIds
      tools: versionModel.mcpServerConfigurationIds.map((mcpServerId) => ({
        mcpServerViewId: makeSId("mcp_server_view", {
          id: mcpServerId,
          workspaceId: workspace.id,
        }),
      })),
      canWrite: currentSkill.canWrite(auth),
    })
  );

  // Include the current version as the first item (latest)
  const currentVersion: SkillConfigurationType = currentSkill.toJSON(auth);

  // Return current version + all historical versions
  return [currentVersion, ...historicalVersions];
}
