import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type {
  GetSlackWorkflowsResponseBody,
  SlackWorkflowType,
} from "@app/types/api/slack/workflows";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

type SlackWorkflowErrorType =
  | "slack_bot_not_connected"
  | "invalid_groups"
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

// The groups a Slack bot may be whitelisted with: the workspace groups a caller can reference
// directly (global, provisioned, regular_manual), plus the `regular_auto` groups backing the
// workspace spaces — a space's group is how the bot gets access to that space's agents. The other
// `regular_auto` groups are agent and skill editor groups, which are never whitelistable.
export async function listSlackWorkflowWhitelistableGroups(
  auth: Authenticator
): Promise<GroupResource[]> {
  const workspaceGroups = await GroupResource.listAllWorkspaceGroups(auth);
  const spaces = await SpaceResource.listWorkspaceSpaces(auth, {
    includeProjectSpaces: true,
    includeRestricted: true,
  });

  const spaceGroups = await SpaceResource.listRegularAutoGroupsForSpaces(
    auth,
    spaces
  );

  return [...workspaceGroups, ...spaceGroups];
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

  const [whitelistRes, groups] = await Promise.all([
    connectorsAPI.getSlackBotSummoningWhitelist({
      connectorId: dataSourceRes.value.connectorId,
    }),
    listSlackWorkflowWhitelistableGroups(auth),
  ]);

  if (whitelistRes.isErr()) {
    return new Err(
      new SlackWorkflowError("connectors_error", whitelistRes.error.message)
    );
  }

  const groupNameById = new Map(groups.map((g) => [g.sId, g.name]));

  const workflows: SlackWorkflowType[] = whitelistRes.value.bots.map((bot) => ({
    botName: bot.botName,
    groups: bot.groupIds.map((sId) => ({
      sId,
      name: groupNameById.get(sId) ?? sId,
    })),
    createdAt: bot.createdAt,
  }));

  return new Ok({ isSlackBotConnected: true, workflows });
}

export async function allowSlackWorkflow(
  auth: Authenticator,
  { botName, groupIds }: { botName: string; groupIds: string[] }
): Promise<Result<undefined, SlackWorkflowError>> {
  const dataSourceRes = await fetchSlackBotDataSource(auth);
  if (dataSourceRes.isErr()) {
    return dataSourceRes;
  }
  const { dataSource, connectorId } = dataSourceRes.value;

  const groups = await listSlackWorkflowWhitelistableGroups(auth);
  const groupById = new Map(groups.map((g) => [g.sId, g]));

  const unknownGroupIds = groupIds.filter((sId) => !groupById.has(sId));
  if (unknownGroupIds.length > 0) {
    return new Err(
      new SlackWorkflowError(
        "invalid_groups",
        `Unknown groups: ${unknownGroupIds.join(", ")}.`
      )
    );
  }

  const globalGroupRes = await GroupResource.fetchWorkspaceGlobalGroup(auth);
  if (globalGroupRes.isErr()) {
    return new Err(
      new SlackWorkflowError(
        "invalid_groups",
        "Failed to fetch the workspace group."
      )
    );
  }

  const allGroupIds = groupIds.includes(globalGroupRes.value.sId)
    ? groupIds
    : [...groupIds, globalGroupRes.value.sId];

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  const whitelistRes = await connectorsAPI.whitelistSlackBotToSummon({
    connectorId,
    botName,
    groupIds: allGroupIds,
  });
  if (whitelistRes.isErr()) {
    return new Err(
      new SlackWorkflowError("connectors_error", whitelistRes.error.message)
    );
  }

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
      group_names: allGroupIds
        .map((sId) => groupById.get(sId)?.name ?? globalGroupRes.value.name)
        .join(", "),
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
