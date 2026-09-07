import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { GroupAgentModel } from "@app/lib/models/agent/group_agent";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { AGENT_GROUP_PREFIX } from "@app/types/groups";
import assert from "assert";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

async function createEditorGroup(
  auth: Authenticator,
  latest: AgentConfigurationModel,
  transaction: Transaction
) {
  const workspace = auth.getNonNullableWorkspace();
  const authors = await UserResource.fetchByModelIds([latest.authorId], {
    transaction,
  });
  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
    users: authors,
    transaction,
  });
  return GroupResource.makeNew(
    {
      workspaceId: workspace.id,
      name: `${AGENT_GROUP_PREFIX} ${latest.name} (${latest.sId})`,
      kind: "agent_editors",
    },
    {
      memberIds: memberships.map(({ userId }) => userId),
      transaction,
    }
  );
}

export async function backfillEditorGroups(
  auth: Authenticator,
  agentId: string,
  execute: boolean,
  logger: Logger
) {
  const workspaceId = auth.getNonNullableWorkspace().id;
  await withTransaction(async (transaction) => {
    // The sId index limits this repair to one agent's versions.
    const configs = await AgentConfigurationModel.findAll({
      attributes: ["id", "sId", "workspaceId", "name", "authorId"],
      where: { workspaceId, sId: agentId, status: { [Op.ne]: "draft" } },
      order: [["version", "DESC"]],
      transaction,
      lock: execute,
    });
    assert(configs.length > 0, "No non-draft configurations found for agent.");
    const links = await GroupAgentModel.findAll({
      attributes: ["groupId", "agentConfigurationId"],
      where: { workspaceId, agentConfigurationId: configs.map(({ id }) => id) },
      transaction,
    });
    const groupIds = [...new Set(links.map(({ groupId }) => groupId))];
    assert(groupIds.length <= 1, "Agent has multiple editor groups.");
    const groups = await GroupResource.dangerouslyFetchByModelIds(
      auth,
      groupIds,
      {
        groupKinds: ["agent_editors"],
        transaction,
      }
    );
    assert(
      groups.length === groupIds.length,
      "Invalid editor group association."
    );
    const linkedIds = new Set(
      links.map(({ agentConfigurationId }) => agentConfigurationId)
    );
    const missing = configs.filter(({ id }) => !linkedIds.has(id));
    logger.info(
      {
        agentId,
        workspaceId,
        execute,
        createGroup: groups.length === 0,
        missingVersions: missing.length,
      },
      "Agent editor group backfill"
    );
    if (!execute || missing.length === 0) {
      return;
    }
    const group =
      groups[0] ?? (await createEditorGroup(auth, configs[0], transaction));
    await GroupAgentModel.bulkCreate(
      missing.map(({ id }) => ({
        workspaceId,
        agentConfigurationId: id,
        groupId: group.id,
      })),
      { transaction }
    );
  });
}

if (require.main === module) {
  makeScript(
    {
      wId: { type: "string", required: true },
      agentId: { type: "string", required: true },
    },
    async ({ wId, agentId, execute }, logger) => {
      const auth = await Authenticator.internalAdminForWorkspace(wId);
      await backfillEditorGroups(auth, agentId, execute, logger);
    }
  );
}
