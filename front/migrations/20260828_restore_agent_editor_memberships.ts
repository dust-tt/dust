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
async function listMembershipsToRestore(
  workspaceModelId: ModelId
): Promise<GroupMembershipModel[]> {
  const editorGroups = await GroupModel.findAll({
    attributes: ["id"],
    where: {
      workspaceId: workspaceModelId,
      kind: "agent_editors",
    },
  });
  if (editorGroups.length === 0) {
    return [];
  }

  const now = new Date();
  return GroupMembershipModel.findAll({
    attributes: ["id", "groupId", "userId"],
    where: {
      workspaceId: workspaceModelId,
      groupId: editorGroups.map((group) => group.id),
      status: "suspended",
      startAt: { [Op.lte]: now },
      [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: now } }],
    },
  });
}

async function restoreWorkspaceAgentEditors(
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
): Promise<void> {
  const memberships = await listMembershipsToRestore(workspace.id);
  if (memberships.length === 0) {
    return;
  }

  const groupCount = new Set(
    memberships.map((membership) => membership.groupId)
  ).size;
  if (!execute) {
    logger.info(
      {
        workspaceId: workspace.sId,
        groups: groupCount,
        membershipsRestored: memberships.length,
      },
      "Dry run: would restore suspended agent editor memberships"
    );
    return;
  }

  const [, restoredMemberships] = await GroupMembershipModel.update(
    { status: "active" },
    {
      where: {
        id: memberships.map((membership) => membership.id),
        workspaceId: workspace.id,
        status: "suspended",
      },
      returning: true,
    }
  );
  const userModelIds = [
    ...new Set(restoredMemberships.map((membership) => membership.userId)),
  ];
  await GroupResource.batchInvalidateGroupIdsCacheForUsers(
    userModelIds.map((userModelId) => [
      {
        user: { id: userModelId },
        workspace: { id: workspace.id },
      },
    ])
  );

  logger.info(
    {
      workspaceId: workspace.sId,
      groups: groupCount,
      membershipsRestored: restoredMemberships.length,
    },
    "Completed agent editor membership restoration for workspace"
  );
}

makeScript(
  {
    wId: { type: "string", required: false },
    fromWorkspace: {
      type: "number",
      required: false,
      description: "Resume from this numeric workspace model ID",
    },
  },
  async ({ wId, fromWorkspace, execute }, logger) => {
    logger.info("Starting agent editor membership restoration");

    await runOnAllWorkspaces(
      async (workspace) => {
        await restoreWorkspaceAgentEditors(execute, logger, workspace);
      },
      {
        concurrency: WORKSPACE_CONCURRENCY,
        wId,
        fromWorkspaceId: fromWorkspace,
      }
    );

    logger.info("Agent editor membership restoration completed");
  }
);
