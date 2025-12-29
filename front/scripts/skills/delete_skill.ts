import { Authenticator } from "@app/lib/auth";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { GroupSkillModel } from "@app/lib/models/skill/group_skill";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { makeScript } from "@app/scripts/helpers";

const argumentSpecs = {
  workspaceId: {
    type: "string" as const,
    description: "Workspace sId",
    demandOption: true,
  },
  skillSId: {
    type: "string" as const,
    description: "Skill sId to delete",
    demandOption: true,
  },
};

makeScript(argumentSpecs, async ({ workspaceId, skillSId, execute }, scriptLogger) => {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const workspace = auth.getNonNullableWorkspace();

  scriptLogger.info({ workspaceId, skillSId }, "Looking up skill to delete");

  // Fetch the skill
  const skill = await SkillResource.fetchById(auth, skillSId);

  if (!skill) {
    scriptLogger.error({ skillSId }, "Skill not found");
    return;
  }

  scriptLogger.info(
    {
      skillSId: skill.sId,
      skillName: skill.name,
      status: skill.status,
    },
    "Found skill"
  );

  // Find all agent links for this skill
  const agentSkillLinks = await AgentSkillModel.findAll({
    where: {
      customSkillId: skill.id,
      workspaceId: workspace.id,
    },
  });

  scriptLogger.info(
    { agentLinkCount: agentSkillLinks.length },
    "Found agent-skill links"
  );

  if (!execute) {
    scriptLogger.info(
      {
        skillSId: skill.sId,
        skillName: skill.name,
        status: skill.status,
        agentLinksToRemove: agentSkillLinks.length,
      },
      "Dry run: would delete skill and remove agent links"
    );
    return;
  }

  // Remove all agent-skill links
  if (agentSkillLinks.length > 0) {
    const deletedLinks = await AgentSkillModel.destroy({
      where: {
        customSkillId: skill.id,
        workspaceId: workspace.id,
      },
    });

    scriptLogger.info({ deletedLinks }, "Removed agent-skill links");
  }

  // Remove all group-skill links (editors group)
  const deletedGroupSkills = await GroupSkillModel.destroy({
    where: {
      skillConfigurationId: skill.id,
      workspaceId: workspace.id,
    },
  });

  if (deletedGroupSkills > 0) {
    scriptLogger.info({ deletedGroupSkills }, "Removed group-skill links");
  }

  // Hard delete the skill configuration
  const deletedCount = await SkillConfigurationModel.destroy({
    where: {
      id: skill.id,
      workspaceId: workspace.id,
    },
  });

  if (deletedCount > 0) {
    scriptLogger.info(
      {
        skillSId: skill.sId,
        skillName: skill.name,
      },
      "Successfully deleted skill"
    );
  } else {
    scriptLogger.error(
      { skillSId: skill.sId },
      "Failed to delete skill"
    );
  }
});
