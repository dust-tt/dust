import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { launchAgentSearchIndexation } from "@app/lib/resources/agent_resource_indexation";
import type { ModelId } from "@app/types/shared/model_id";
import uniq from "lodash/uniq";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

// Leaf module (imports only agent models and the agent indexation leaf, never `AgentResource`) so
// `SkillResource` — which `AgentResource` depends on — can import it without forming a cycle.

async function listAgentIdsUsingCustomSkill(
  auth: Authenticator,
  {
    customSkillModelId,
    transaction,
  }: { customSkillModelId: ModelId; transaction?: Transaction }
): Promise<string[]> {
  const workspaceModelId = auth.getNonNullableWorkspace().id;

  const agentSkills = await AgentSkillModel.findAll({
    attributes: ["agentConfigurationId"],
    where: { workspaceId: workspaceModelId, customSkillId: customSkillModelId },
    transaction,
  });
  if (agentSkills.length === 0) {
    return [];
  }

  const agentConfigurations = await AgentConfigurationModel.findAll({
    attributes: ["sId"],
    where: {
      workspaceId: workspaceModelId,
      id: {
        [Op.in]: uniq(agentSkills.map((s) => s.agentConfigurationId)),
      },
    },
    transaction,
  });

  return uniq(agentConfigurations.map((configuration) => configuration.sId));
}

/**
 * @cc [owner:tdraier,label:backend;performance] agent-skill-cascade-through-agent-domain
 * A custom skill lifecycle change that alters the skills an agent exposes (a status change such as
 * archive or restore, or the skill's deletion) MUST be signalled through this module, which owns
 * every agent-side effect of it: the agent-skill link removal on deletion and the refresh of the
 * derived state (today the search index) of every agent linked to the skill, on any configuration
 * version. Callers MUST NOT destroy a skill's `AgentSkillModel` rows directly nor refresh the agents
 * themselves for that change (the workspace scrub, which drops every row of the workspace, is
 * exempt); other agent-domain writes the change triggers, such as
 * `updateAgentRequestedSpaceIdsInPlace`, keep their own effects. Link removal applies in place, with
 * no new agent version, and is NOT gated on the agent's `write`/`admin` verbs. Under a transaction,
 * the refresh runs after commit.
 */
export async function onCustomSkillStatusChanged(
  auth: Authenticator,
  {
    customSkillModelId,
    transaction,
  }: { customSkillModelId: ModelId; transaction?: Transaction }
): Promise<void> {
  const agentIds = await listAgentIdsUsingCustomSkill(auth, {
    customSkillModelId,
    transaction,
  });

  // `skill_ids` is indexed and only lists active skills, so the affected agents are now stale.
  await launchAgentSearchIndexation(
    auth.getNonNullableWorkspace().sId,
    agentIds,
    transaction
  );
}

export async function destroyAgentSkillLinksForCustomSkill(
  auth: Authenticator,
  {
    customSkillModelId,
    transaction,
  }: { customSkillModelId: ModelId; transaction?: Transaction }
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  const agentIds = await listAgentIdsUsingCustomSkill(auth, {
    customSkillModelId,
    transaction,
  });

  await AgentSkillModel.destroy({
    where: { workspaceId: owner.id, customSkillId: customSkillModelId },
    transaction,
  });

  await launchAgentSearchIndexation(owner.sId, agentIds, transaction);
}
