import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type {
  GetSlackWorkflowsResponseBody,
  SlackWorkflowType,
} from "@app/types/api/slack/workflows";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";

type SlackWorkflowErrorType =
  | "slack_bot_not_connected"
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

async function listSelectableSpaces(
  auth: Authenticator
): Promise<SpaceResource[]> {
  const spaces = await SpaceResource.listWorkspaceSpaces(auth, {
    includeProjectSpaces: true,
  });

  return spaces.filter((space) => space.isRegular() || space.isProject());
}

export async function listSlackWorkflowSpaces(
  auth: Authenticator
): Promise<{ sId: string; name: string }[]> {
  const spaces = await listSelectableSpaces(auth);

  return spaces.map((space) => ({ sId: space.sId, name: space.name }));
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

  const [spaces, whitelistRes] = await Promise.all([
    listSelectableSpaces(auth),
    connectorsAPI.getSlackBotSummoningWhitelist({
      connectorId: dataSourceRes.value.connectorId,
    }),
  ]);

  if (whitelistRes.isErr()) {
    return new Err(
      new SlackWorkflowError("connectors_error", whitelistRes.error.message)
    );
  }

  const spaceById = new Map(spaces.map((space) => [space.sId, space]));

  const workflows: SlackWorkflowType[] = whitelistRes.value.bots.map((bot) => ({
    botName: bot.botName,
    spaces: removeNulls(
      bot.spaceIds.map((spaceId) => spaceById.get(spaceId))
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

  const spaces = await listSelectableSpaces(auth);
  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);

  const selectableSpaceIds = new Set(spaces.map((space) => space.sId));

  const unknownSpaceIds = spaceIds.filter(
    (spaceId) => !selectableSpaceIds.has(spaceId)
  );
  if (unknownSpaceIds.length > 0) {
    return new Err(
      new SlackWorkflowError(
        "invalid_spaces",
        `Unknown spaces: ${unknownSpaceIds.join(", ")}.`
      )
    );
  }

  // Every workflow reaches the Company Space, so it is stored like any other space it can reach.
  const allowedSpaceIds = [globalSpace.sId, ...spaceIds];

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  const whitelistRes = await connectorsAPI.whitelistSlackBotToSummon({
    connectorId,
    botName,
    spaceIds: allowedSpaceIds,
  });
  if (whitelistRes.isErr()) {
    return new Err(
      new SlackWorkflowError("connectors_error", whitelistRes.error.message)
    );
  }

  const spaceNameBySpaceId = new Map(
    spaces.map((space) => [space.sId, space.name])
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
