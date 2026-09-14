import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { SlackAutoReadPattern } from "@connectors/types";
import { DustAPI, Err } from "@dust-tt/client";
import { describe, expect, it, vi } from "vitest";

vi.mock(import("@connectors/connectors/slack/temporal/client"), () => ({
  launchJoinChannelWorkflow: vi.fn(),
}));

vi.mock(import("@connectors/lib/api/config"), async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    apiConfig: {
      ...original.apiConfig,
      getDustFrontAPIUrl: () => "https://dust.test",
    },
  };
});

import { launchJoinChannelWorkflow } from "@connectors/connectors/slack/temporal/client";

import { autoReadChannel } from "./auto_read_channel";

const logger = mainLogger.child({});

async function makeSlackConnector(
  slackTeamId: string,
  autoReadChannelPatterns: SlackAutoReadPattern[] = []
) {
  return ConnectorResource.makeNew(
    "slack",
    {
      connectionId: "connection-id",
      dataSourceId: "data-source-id",
      workspaceAPIKey: "workspace-api-key",
      workspaceId: "workspace-id",
    },
    {
      autoReadChannelPatterns,
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

  it("should skip channels whose workspace is unavailable", async () => {
    // Configure a matching pattern so a healthy workspace would launch the
    // join workflow: not launching it proves the skip.
    await makeSlackConnector("T_UNAVAILABLE_WS", [
      { pattern: "C.*", spaceId: "space-id" },
    ]);
    const existsSpy = vi.spyOn(DustAPI.prototype, "exists").mockResolvedValue(
      new Err({
        type: "plan_limit_error",
        message:
          "Your current plan does not allow API access. Please upgrade your plan.",
      })
    );

    const res = await autoReadChannel("T_UNAVAILABLE_WS", logger, "C123");
    existsSpy.mockRestore();

    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      expect(res.value).toBe(false);
    }
    expect(launchJoinChannelWorkflow).not.toHaveBeenCalled();
  });
});
