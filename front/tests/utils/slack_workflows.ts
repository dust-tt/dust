import { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
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
  return DataSourceViewFactory.fromConnector(
    workspace,
    space,
    "slack_bot",
    null,
    { connectorId: SLACK_BOT_CONNECTOR_ID }
  );
}

// The whitelist is keyed on a space's own member group, so a test that seeds it needs both.
export async function createSpaceWithMemberGroup(
  workspace: WorkspaceType
): Promise<{ space: SpaceResource; memberGroupId: string }> {
  const space = await SpaceFactory.regular(workspace);
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const memberGroup = await space.fetchManualMemberGroup(auth);

  return { space, memberGroupId: memberGroup.sId };
}

export function mockSummoningWhitelist(
  bots: { botName: string; groupIds: string[] }[]
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
