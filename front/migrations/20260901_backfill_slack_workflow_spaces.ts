import { createReadStream } from "fs";
import { createInterface } from "readline";

import config from "@app/lib/api/config";
import { listSpaceMemberGroups } from "@app/lib/api/spaces";
import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { Logger } from "@app/logger/logger";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { WHOLE_TYPE_RESOURCE_ID } from "@app/types/group_permissions";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";

// Records, on every Slack workflow allowed before the whitelist moved to spaces, the spaces its
// stored group ids stand for. Reach is unchanged: a group that can read a space and that space's
// own member group make the same agents visible, so swapping one for the other at run time shows
// the workflow the same thing. What it gives up is drift — attaching the group to a new space no
// longer widens the workflow — which is the point of keying on spaces.
//
// This writes `spaceIds` through the connectors API rather than `allowSlackWorkflow`, which always
// prepends the Company Space. A row that never held the global group would gain reach it does not
// have today.
//
// A group with no space grant maps to nothing, and that is faithful: it grants no space reach now
// either. But a row whose every group maps to nothing is left on its group ids, because an empty
// `spaceIds` reads as "reaches nothing" and would silence the workflow instead of preserving it.

// Every space role in the registry (`reader`, `member`, `admin`) confers read, so any space grant
// means the group could summon that space's agents. Keyed on the group `sId`, which is what the
// whitelist stores.
async function listSpaceIdsByGroupId(
  auth: Authenticator,
  workspace: LightWorkspaceType,
  logger: Logger
): Promise<Map<string, string[]>> {
  const [workspaceGroups, spaces, globalSpace] = await Promise.all([
    GroupResource.listAllWorkspaceGroups(auth),
    SpaceResource.listWorkspaceSpaces(auth, { includeProjectSpaces: true }),
    SpaceResource.fetchWorkspaceGlobalSpace(auth),
  ]);
  const groups = [
    ...workspaceGroups,
    ...(await SpaceResource.listRegularAutoGroupsForSpaces(auth, spaces)),
  ];

  const grants = await GroupPermissionResource.listForGroups(workspace, {
    groupModelIds: groups.filter((group) => !group.isGlobal()).map((g) => g.id),
    resourceType: "space",
  });
  const spaceGrants = grants.filter(
    (grant) => grant.resourceId !== WHOLE_TYPE_RESOURCE_ID
  );

  const grantedSpaces = await SpaceResource.fetchByModelIds(
    auth,
    spaceGrants.map((grant) => grant.resourceId)
  );
  const candidateSpaces = grantedSpaces.filter(
    (space) => space.isRegular() || space.isProject()
  );

  const spaceMemberGroups = await listSpaceMemberGroups(auth, [
    globalSpace,
    ...candidateSpaces,
  ]);
  const representedSpaceById = new Map(
    spaceMemberGroups.map(({ space }) => [space.id, space])
  );

  const spaceIdsByGroupModelId = new Map<ModelId, Set<string>>();
  for (const grant of spaceGrants) {
    const space = representedSpaceById.get(grant.resourceId);
    if (!space) {
      continue;
    }

    const spaceIds = spaceIdsByGroupModelId.get(grant.groupId) ?? new Set();
    spaceIds.add(space.sId);
    spaceIdsByGroupModelId.set(grant.groupId, spaceIds);
  }

  const unrepresentedSpaceIds = candidateSpaces
    .filter((space) => !representedSpaceById.has(space.id))
    .map((space) => space.sId);
  if (unrepresentedSpaceIds.length > 0) {
    logger.warn(
      { workspaceId: workspace.sId, unrepresentedSpaceIds },
      "Spaces with no member group, dropped from the whitelist"
    );
  }

  return new Map(
    groups.map((group) => [
      group.sId,
      group.isGlobal()
        ? [globalSpace.sId]
        : [...(spaceIdsByGroupModelId.get(group.id) ?? [])],
    ])
  );
}

async function parseWorkspaceModelIds(filePath: string): Promise<ModelId[]> {
  const lines = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });

  const workspaceModelIds: ModelId[] = [];
  for await (const line of lines) {
    const workspaceModelId = line.trim();
    if (!workspaceModelId) {
      continue;
    }
    if (!/^\d+$/.test(workspaceModelId)) {
      throw new Error(`Not a workspace id: "${workspaceModelId}"`);
    }

    workspaceModelIds.push(Number(workspaceModelId));
  }

  return workspaceModelIds;
}

async function backfillWorkflows(
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const [dataSource] = await DataSourceResource.listByConnectorProvider(
    auth,
    "slack_bot"
  );
  if (!dataSource?.connectorId) {
    logger.warn(
      { workspaceId: workspace.sId },
      "No Slack bot connected, nothing to backfill"
    );
    return;
  }
  const { connectorId } = dataSource;

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  const whitelistRes = await connectorsAPI.getSlackBotSummoningWhitelist({
    connectorId,
  });
  if (whitelistRes.isErr()) {
    logger.error(
      { workspaceId: workspace.sId, error: whitelistRes.error },
      "Failed to read the summoning whitelist"
    );
    return;
  }

  const pendingBots = whitelistRes.value.bots.filter(
    (bot) => bot.spaceIds === null && bot.groupIds.length > 0
  );
  if (pendingBots.length === 0) {
    return;
  }

  const spaceIdsByGroupId = await listSpaceIdsByGroupId(
    auth,
    workspace,
    logger
  );

  for (const bot of pendingBots) {
    const spaceIds = [
      ...new Set(
        bot.groupIds.flatMap((groupId) => spaceIdsByGroupId.get(groupId) ?? [])
      ),
    ];
    const groupIdsWithoutSpace = bot.groupIds.filter(
      (groupId) => (spaceIdsByGroupId.get(groupId) ?? []).length === 0
    );
    const context = {
      workspaceId: workspace.sId,
      botName: bot.botName,
      groupIds: bot.groupIds,
      groupIdsWithoutSpace,
      spaceIds,
    };

    if (spaceIds.length === 0) {
      logger.warn(
        context,
        "No space to record, leaving the whitelist on groups"
      );
      continue;
    }

    if (!execute) {
      logger.info(context, "Dry-run: would record the spaces of the workflow");
      continue;
    }

    const updateRes = await connectorsAPI.whitelistSlackBotToSummon({
      connectorId,
      botName: bot.botName,
      groupIds: bot.groupIds,
      spaceIds,
    });
    if (updateRes.isErr()) {
      logger.error(
        { ...context, error: updateRes.error },
        "Failed to record the spaces of the workflow"
      );
      continue;
    }

    logger.info(context, "Recorded the spaces of the workflow");
  }
}

makeScript(
  {
    filePath: {
      type: "string",
      required: true,
      description:
        "Path to a file holding one workspace id per line: the workspaces with a whitelisted Slack workflow",
    },
  },
  async ({ filePath, execute }, logger) => {
    const workspaceModelIds = await parseWorkspaceModelIds(filePath);
    const workspaces =
      await WorkspaceResource.fetchByModelIds(workspaceModelIds);
    logger.info(
      { requested: workspaceModelIds.length, found: workspaces.length },
      "Workspaces to backfill"
    );

    await concurrentExecutor(
      workspaces,
      (workspace) =>
        backfillWorkflows(
          execute,
          logger,
          renderLightWorkspaceType({ workspace })
        ),
      { concurrency: 8 }
    );
  }
);
