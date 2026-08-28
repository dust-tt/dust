import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import { Op } from "sequelize";

const WORKSPACE_CONCURRENCY = 8;

// Restore every suspended agent-editors membership, not only archived agents: after this deploy
// there is no valid path that suspends this group kind, and status-scoping would race restorations.
async function listGroupsToRestore(
  auth: Authenticator,
  workspaceModelId: ModelId
): Promise<{
  groups: GroupResource[];
  suspendedCountByGroupId: Map<ModelId, number>;
}> {
  const empty = {
    groups: [],
    suspendedCountByGroupId: new Map<ModelId, number>(),
  };

  const editorGroups = await GroupModel.findAll({
    attributes: ["id"],
    where: {
      workspaceId: workspaceModelId,
      kind: "agent_editors",
    },
  });
  if (editorGroups.length === 0) {
    return empty;
  }

  const now = new Date();
  const suspendedMemberships = await GroupMembershipModel.findAll({
    attributes: ["groupId", "userId"],
    where: {
      workspaceId: workspaceModelId,
      groupId: editorGroups.map((group) => group.id),
      status: "suspended",
      startAt: { [Op.lte]: now },
      [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: now } }],
    },
  });
  if (suspendedMemberships.length === 0) {
    return empty;
  }

  const suspendedCountByGroupId = new Map<ModelId, number>();
  for (const membership of suspendedMemberships) {
    suspendedCountByGroupId.set(
      membership.groupId,
      (suspendedCountByGroupId.get(membership.groupId) ?? 0) + 1
    );
  }

  const groups = await GroupResource.fetchByModelIds(
    auth,
    [...suspendedCountByGroupId.keys()],
    { groupKinds: ["agent_editors"] }
  );

  return { groups, suspendedCountByGroupId };
}

async function restoreWorkspaceAgentEditors(
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId, {
    dangerouslyRequestAllGroups: true,
  });
  const workspaceModelId = auth.getNonNullableWorkspace().id;

  const { groups, suspendedCountByGroupId } = await listGroupsToRestore(
    auth,
    workspaceModelId
  );
  if (groups.length === 0) {
    return;
  }

  let membershipsRestored = 0;

  for (const group of groups) {
    const suspendedCount = suspendedCountByGroupId.get(group.id) ?? 0;

    if (!execute) {
      membershipsRestored += suspendedCount;
      logger.info(
        {
          workspaceId: workspace.sId,
          groupId: group.id,
          editorCount: suspendedCount,
        },
        "Dry run: would restore the agent's suspended editor memberships"
      );
      continue;
    }

    const restoredUserIds = await group.restoreMembers(auth);
    membershipsRestored += restoredUserIds.length;

    logger.info(
      {
        workspaceId: workspace.sId,
        groupId: group.id,
        editorCount: restoredUserIds.length,
      },
      "Restored the agent's suspended editor memberships"
    );
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      groups: groups.length,
      membershipsRestored,
    },
    "Completed agent editor membership restoration for workspace"
  );
}

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    logger.info("Starting agent editor membership restoration");

    await runOnAllWorkspaces(
      async (workspace) => {
        await restoreWorkspaceAgentEditors(execute, logger, workspace);
      },
      { concurrency: WORKSPACE_CONCURRENCY, wId }
    );

    logger.info("Agent editor membership restoration completed");
  }
);
