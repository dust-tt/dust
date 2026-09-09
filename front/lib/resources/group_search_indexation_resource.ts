import {
  AgentConfigurationModel,
  AgentModel,
} from "@app/lib/models/agent/agent";
import { GroupAgentModel } from "@app/lib/models/agent/group_agent";
import { AgentSearchIndexationResource } from "@app/lib/resources/agent/agent_search_indexation_resource";
import { GroupPermissionModel } from "@app/lib/resources/storage/models/group_permissions";
import { makeSId } from "@app/lib/resources/string_ids";
import { launchSkillsSearchIndexation } from "@app/lib/skill_search/indexation";
import { runAfterTransactionCommit } from "@app/lib/utils/sql_utils";
import type { GrantSpec } from "@app/types/group_permissions";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

interface GroupSearchIndexationTargets {
  skillIds: string[];
  agentIds: string[];
}

// Shared by group and grant writers without importing one another.
export class GroupSearchIndexationResource {
  static async fetchForGroups(
    workspace: LightWorkspaceType,
    groupModelIds: readonly ModelId[],
    transaction?: Transaction
  ): Promise<GroupSearchIndexationTargets> {
    const groupIds = [...new Set(groupModelIds)];
    if (groupIds.length === 0) {
      return { skillIds: [], agentIds: [] };
    }
    const grants = await GroupPermissionModel.findAll({
      attributes: ["grantType", "resourceType", "resourceId"],
      where: {
        workspaceId: workspace.id,
        groupId: groupIds,
        grantType: "editor",
        resourceType: ["skill", "agent"],
        resourceId: { [Op.gt]: 0 },
      },
      transaction,
    });
    const legacyAgents = await AgentConfigurationModel.findAll({
      attributes: ["sId"],
      where: { workspaceId: workspace.id },
      include: [
        {
          model: GroupAgentModel,
          as: "agentGroupLinks",
          attributes: [],
          required: true,
          where: { workspaceId: workspace.id, groupId: groupIds },
        },
      ],
      transaction,
    });
    const targets = await this.fetchForGrants(workspace, grants, transaction);
    return {
      skillIds: targets.skillIds,
      agentIds: [
        ...new Set([
          ...targets.agentIds,
          ...legacyAgents.map((agent) => agent.sId),
        ]),
      ],
    };
  }

  private static async fetchForGrants(
    workspace: LightWorkspaceType,
    grants: readonly GrantSpec[],
    transaction?: Transaction
  ): Promise<GroupSearchIndexationTargets> {
    const editorGrants = grants.filter(
      (grant) => grant.grantType === "editor" && grant.resourceId > 0
    );
    const agentModelIds = editorGrants
      .filter((grant) => grant.resourceType === "agent")
      .map((grant) => grant.resourceId);
    const agents = agentModelIds.length
      ? await AgentModel.findAll({
          attributes: ["sId"],
          where: { workspaceId: workspace.id, id: agentModelIds },
          transaction,
        })
      : [];
    return {
      skillIds: [
        ...new Set(
          editorGrants
            .filter((grant) => grant.resourceType === "skill")
            .map((grant) =>
              makeSId("skill", {
                id: grant.resourceId,
                workspaceId: workspace.id,
              })
            )
        ),
      ],
      agentIds: [...new Set(agents.map((agent) => agent.sId))],
    };
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend;security] editor-grant-search-invalidation
   * Instance editor-grant writes refresh their exact skill or stable-agent targets after the
   * outer commit; removed grants remain valid invalidation targets and other grant kinds do not fan out.
   */
  static async launchForGrants(
    {
      workspace,
      grants,
    }: { workspace: LightWorkspaceType; grants: readonly GrantSpec[] },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    const targets = await this.fetchForGrants(workspace, grants, transaction);
    if (targets.skillIds.length === 0 && targets.agentIds.length === 0) {
      return;
    }
    await this.launch(workspace, targets, transaction);
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend;security] editor-membership-search-invalidation
   * Group membership changes reindex only their workspace's skill and agent editor targets,
   * deduplicated by logical resource; an explicit outer transaction must commit first.
   */
  static async launch(
    workspace: LightWorkspaceType,
    targets: GroupSearchIndexationTargets,
    transaction?: Transaction
  ): Promise<void> {
    await runAfterTransactionCommit(transaction, async () => {
      await Promise.all([
        launchSkillsSearchIndexation({
          workspaceId: workspace.sId,
          skillIds: targets.skillIds,
        }),
        AgentSearchIndexationResource.launch({
          workspaceId: workspace.sId,
          agentIds: targets.agentIds,
        }),
      ]);
    });
  }

  static async launchForGroups(
    {
      workspace,
      groupModelIds,
    }: { workspace: LightWorkspaceType; groupModelIds: readonly ModelId[] },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    const targets = await this.fetchForGroups(
      workspace,
      groupModelIds,
      transaction
    );
    await this.launch(workspace, targets, transaction);
  }
}
