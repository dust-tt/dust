import { randomUUID } from "crypto";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { makeScript } from "@app/scripts/helpers";

const argumentSpecs = {
  workspaceId: {
    type: "string" as const,
    description: "Workspace sId",
    demandOption: true,
  },
  agentSIds: {
    type: "array" as const,
    description: "List of agent sIds to associate with the skill suggestion",
    demandOption: true,
  },
};

makeScript(argumentSpecs, async ({ workspaceId, agentSIds, execute }, scriptLogger) => {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const workspace = auth.getNonNullableWorkspace();

  // Generate unique name with short UUID
  const shortUid = randomUUID().slice(0, 8);
  const name = `Test skill ${shortUid}`;

  scriptLogger.info({ workspaceId, agentSIds, name }, "Creating skill suggestion");

  // Fetch agent configurations by sId
  const agentConfigurations = await AgentConfigurationModel.findAll({
    where: {
      sId: { [Op.in]: agentSIds },
      workspaceId: workspace.id,
      status: "active",
    },
  });

  if (agentConfigurations.length === 0) {
    scriptLogger.error({ agentSIds }, "No active agents found with the provided sIds");
    return;
  }

  if (agentConfigurations.length !== agentSIds.length) {
    const foundSIds = agentConfigurations.map((a) => a.sId);
    const missingSIds = agentSIds.filter((sId) => !foundSIds.includes(sId));
    scriptLogger.warn(
      { missingSIds, foundSIds },
      "Some agents were not found or are not active"
    );
  }

  scriptLogger.info(
    {
      foundAgents: agentConfigurations.map((a) => ({
        sId: a.sId,
        name: a.name,
      })),
    },
    "Found agents"
  );

  if (!execute) {
    scriptLogger.info(
      { name, agentCount: agentConfigurations.length },
      "Dry run: would create skill suggestion"
    );
    return;
  }

  // Create the skill with status "suggested"
  const skill = await SkillResource.makeNew(
    auth,
    {
      authorId: null, // Suggested skills have no author
      name,
      agentFacingDescription: "Test skill agent facing description",
      userFacingDescription: "Test skill user facing description",
      instructions: `Test skill instructions
- First bullet point
- Second bullet point`,
      requestedSpaceIds: [],
      status: "suggested",
    },
    {
      mcpServerViews: [],
      skipEditorGroupMembership: true,
    }
  );

  scriptLogger.info({ skillId: skill.id, skillSId: skill.sId }, "Created skill suggestion");

  // Link the skill to all the agents
  for (const agent of agentConfigurations) {
    await AgentSkillModel.create({
      workspaceId: workspace.id,
      customSkillId: skill.id,
      globalSkillId: null,
      agentConfigurationId: agent.id,
    });

    scriptLogger.info({ agentSId: agent.sId, agentName: agent.name }, "Linked skill to agent");
  }

  scriptLogger.info(
    {
      skillSId: skill.sId,
      skillName: name,
      linkedAgents: agentConfigurations.length,
    },
    "Successfully created skill suggestion and linked to agents"
  );
});
