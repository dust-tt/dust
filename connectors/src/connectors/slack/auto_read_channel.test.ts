import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { describe, expect, it, vi } from "vitest";

vi.mock(import("@connectors/connectors/slack/temporal/client"), () => ({
  launchJoinChannelWorkflow: vi.fn(),
}));

import { launchJoinChannelWorkflow } from "@connectors/connectors/slack/temporal/client";

import { autoReadChannel } from "./auto_read_channel";

const logger = mainLogger.child({});

async function makeSlackConnector(slackTeamId: string) {
  return ConnectorResource.makeNew(
    "slack",
    {
      connectionId: "connection-id",
      dataSourceId: "data-source-id",
      workspaceAPIKey: "workspace-api-key",
      workspaceId: "workspace-id",
    },
    {
      autoReadChannelPatterns: [],
      botEnabled: true,
      feedbackVisibleToAuthorOnly: true,
      restrictedSpaceAgentsEnabled: true,
      slackTeamId,
    }
  );
}

describe("autoReadChannel", () => {
  it("should ignore channels whose team has no connector", async () => {
    const res = await autoReadChannel("T_NO_CONNECTOR", logger, "C123");

    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      expect(res.value).toBe(false);
    }
    expect(launchJoinChannelWorkflow).not.toHaveBeenCalled();
  });

  it("should ignore channels whose team has no connector for the requested provider", async () => {
    await makeSlackConnector("T_SLACK_ONLY");

    const res = await autoReadChannel(
      "T_SLACK_ONLY",
      logger,
      "C123",
      "slack_bot"
    );

    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      expect(res.value).toBe(false);
    }
    expect(launchJoinChannelWorkflow).not.toHaveBeenCalled();
  });
});
