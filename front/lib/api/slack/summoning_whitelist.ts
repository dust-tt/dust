import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type {
  GetSlackWorkflowsResponseBody,
  SlackWorkflowType,
} from "@app/types/api/slack/workflows";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { GrantSpec } from "@app/types/group_permissions";
import {
  grantKey,
  SPACE_MEMBER_GRANT_TYPE,
} from "@app/types/group_permissions";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";

type SlackWorkflowErrorType =
  | "slack_bot_not_connected"
  | "invalid_groups"
  | "invalid_spaces"
  | "not_found"
  | "connectors_error";

export class SlackWorkflowError extends Error {
  constructor(
    readonly type: SlackWorkflowErrorType,
    message: string
  ) {
    super(message);
  }
}

type SpaceMemberGroup = {
  space: SpaceResource;
  memberGroupId: string;
};

async function fetchSlackBotDataSource(
  auth: Authenticator
): Promise<
  Result<
    { dataSource: DataSourceResource; connectorId: string },
    SlackWorkflowError
  >
> {
  const [dataSource] = await DataSourceResource.listByConnectorProvider(
    auth,
    "slack_bot"
  );

  if (!dataSource?.connectorId) {
    return new Err(
      new SlackWorkflowError(
        "slack_bot_not_connected",
        "The Dust Slack bot is not connected to this workspace."
      )
    );
  }

  return new Ok({ dataSource, connectorId: dataSource.connectorId });
}

function spaceMemberGrant(space: SpaceResource): GrantSpec {
  return {
    grantType: SPACE_MEMBER_GRANT_TYPE,
    resourceType: "space",
    resourceId: space.id,
  };
}

// Connectors stores the whitelist as group ids, so a space has to be represented by one of its
// groups. Only its own regular_auto member group will do: it lives and dies with the space and
// cannot be attached to another one, so it grants exactly that space forever. A provisioned group
// would drift the moment an admin attaches it elsewhere.
async function listSpaceMemberGroups(
  auth: Authenticator
): Promise<SpaceMemberGroup[]> {
  const spaces = await SpaceResource.listWorkspaceSpaces(auth, {
    includeProjectSpaces: true,
  });
  const selectableSpaces = spaces.filter(
    (space) => space.isRegular() || space.isProject()
  );

  const memberGroupByGrantKey =
    await GroupPermissionResource.findRegularAutoGroupsForGrants(auth, {
      grants: selectableSpaces.map(spaceMemberGrant),
    });

  return removeNulls(
    selectableSpaces.map((space) => {
      const memberGroup = memberGroupByGrantKey.get(
        grantKey(spaceMemberGrant(space))
      );

      return memberGroup ? { space, memberGroupId: memberGroup.sId } : null;
    })
  );
}

export async function listSlackWorkflowSpaces(
  auth: Authenticator
): Promise<{ sId: string; name: string }[]> {
  const spaceMemberGroups = await listSpaceMemberGroups(auth);

  return spaceMemberGroups.map(({ space }) => ({
    sId: space.sId,
    name: space.name,
  }));
}

export async function listSlackWorkflows(
  auth: Authenticator
): Promise<Result<GetSlackWorkflowsResponseBody, SlackWorkflowError>> {
  const dataSourceRes = await fetchSlackBotDataSource(auth);
  if (dataSourceRes.isErr()) {
    if (dataSourceRes.error.type === "slack_bot_not_connected") {
      return new Ok({ isSlackBotConnected: false, workflows: [] });
    }
    return dataSourceRes;
  }

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  const [whitelistRes, spaceMemberGroups] = await Promise.all([
    connectorsAPI.getSlackBotSummoningWhitelist({
      connectorId: dataSourceRes.value.connectorId,
    }),
    listSpaceMemberGroups(auth),
  ]);

  if (whitelistRes.isErr()) {
    return new Err(
      new SlackWorkflowError("connectors_error", whitelistRes.error.message)
    );
  }

  const spaceByMemberGroupId = new Map(
    spaceMemberGroups.map(({ space, memberGroupId }) => [memberGroupId, space])
  );

  const workflows: SlackWorkflowType[] = whitelistRes.value.bots.map((bot) => ({
    botName: bot.botName,
    spaces: removeNulls(
      bot.groupIds.map((groupId) => spaceByMemberGroupId.get(groupId))
    ).map((space) => ({ sId: space.sId, name: space.name })),
    createdAt: bot.createdAt,
  }));

  return new Ok({ isSlackBotConnected: true, workflows });
}

export async function allowSlackWorkflow(
  auth: Authenticator,
  { botName, spaceIds }: { botName: string; spaceIds: string[] }
): Promise<Result<undefined, SlackWorkflowError>> {
  const dataSourceRes = await fetchSlackBotDataSource(auth);
  if (dataSourceRes.isErr()) {
    return dataSourceRes;
  }
  const { dataSource, connectorId } = dataSourceRes.value;

  const [spaceMemberGroups, globalGroupRes] = await Promise.all([
    listSpaceMemberGroups(auth),
    GroupResource.fetchWorkspaceGlobalGroup(auth),
  ]);
  if (globalGroupRes.isErr()) {
    return new Err(
      new SlackWorkflowError(
        "invalid_groups",
        "Failed to fetch the workspace group."
      )
    );
  }

  const memberGroupIdBySpaceId = new Map(
    spaceMemberGroups.map(({ space, memberGroupId }) => [
      space.sId,
      memberGroupId,
    ])
  );

  const unknownSpaceIds = spaceIds.filter(
    (spaceId) => !memberGroupIdBySpaceId.has(spaceId)
  );
  if (unknownSpaceIds.length > 0) {
    return new Err(
      new SlackWorkflowError(
        "invalid_spaces",
        `Unknown spaces: ${unknownSpaceIds.join(", ")}.`
      )
    );
  }

  // The global group grants the Company Space, which every workflow reaches.
  const groupIds = [
    globalGroupRes.value.sId,
    ...removeNulls(
      spaceIds.map((spaceId) => memberGroupIdBySpaceId.get(spaceId))
    ),
  ];

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  const whitelistRes = await connectorsAPI.whitelistSlackBotToSummon({
    connectorId,
    botName,
    groupIds,
  });
  if (whitelistRes.isErr()) {
    return new Err(
      new SlackWorkflowError("connectors_error", whitelistRes.error.message)
    );
  }

  const spaceNameBySpaceId = new Map(
    spaceMemberGroups.map(({ space }) => [space.sId, space.name])
  );

  void emitAuditLogEvent({
    auth,
    action: "slack_workflow.allowed",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("data_source", dataSource),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      bot_name: botName,
      space_names: removeNulls(
        spaceIds.map((spaceId) => spaceNameBySpaceId.get(spaceId))
      ).join(", "),
    },
  });

  return new Ok(undefined);
}

export async function revokeSlackWorkflow(
  auth: Authenticator,
  { botName }: { botName: string }
): Promise<Result<undefined, SlackWorkflowError>> {
  const dataSourceRes = await fetchSlackBotDataSource(auth);
  if (dataSourceRes.isErr()) {
    return dataSourceRes;
  }
  const { dataSource, connectorId } = dataSourceRes.value;

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  const revokeRes = await connectorsAPI.unwhitelistSlackBotToSummon({
    connectorId,
    botName,
  });
  if (revokeRes.isErr()) {
    return new Err(
      new SlackWorkflowError(
        revokeRes.error.type === "not_found" ? "not_found" : "connectors_error",
        revokeRes.error.message
      )
    );
  }

  void emitAuditLogEvent({
    auth,
    action: "slack_workflow.revoked",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("data_source", dataSource),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      bot_name: botName,
    },
  });

  return new Ok(undefined);
}
