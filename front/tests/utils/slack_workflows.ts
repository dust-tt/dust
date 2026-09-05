import type { SpaceResource } from "@app/lib/resources/space_resource";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { vi } from "vitest";

export const SLACK_BOT_CONNECTOR_ID = "1234";
export const SLACK_WORKFLOW_BOT_NAME = "Weekly report";
export const SLACK_WORKFLOW_CREATED_AT_MS = 1756166400000;

export async function connectSlackBot(
  workspace: WorkspaceType,
  space: SpaceResource
) {
  const dataSourceView = await DataSourceViewFactory.fromConnector(
    workspace,
    space,
    "slack_bot"
  );
  await dataSourceView.dataSource.setConnectorId(SLACK_BOT_CONNECTOR_ID);

  return dataSourceView;
}

export function mockSummoningWhitelist(
  bots: { botName: string; spaceIds: string[] }[]
) {
  return vi
    .spyOn(ConnectorsAPI.prototype, "getSlackBotSummoningWhitelist")
    .mockResolvedValue(
      new Ok({
        bots: bots.map((bot) => ({
          ...bot,
          createdAt: SLACK_WORKFLOW_CREATED_AT_MS,
        })),
      })
    );
}

export function mockAllowSlackWorkflow() {
  return vi
    .spyOn(ConnectorsAPI.prototype, "whitelistSlackBotToSummon")
    .mockResolvedValue(new Ok({ success: true }));
}

export function mockRevokeSlackWorkflow() {
  return vi
    .spyOn(ConnectorsAPI.prototype, "unwhitelistSlackBotToSummon")
    .mockResolvedValue(new Ok({ success: true }));
}
