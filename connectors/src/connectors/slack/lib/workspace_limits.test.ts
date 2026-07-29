import type { SlackUserInfo } from "@connectors/connectors/slack/lib/slack_client";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { DustAPI, Ok } from "@dust-tt/client";
import { ErrorCode, WebClient } from "@slack/web-api";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock(import("@connectors/lib/bot/conversation_utils"), () => ({
  makeDustAppUrl: () => "https://dust.test",
}));

vi.mock(import("@connectors/types"), async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    cacheWithRedis: <T, Args extends unknown[]>(
      fn: (...args: Args) => Promise<T>
    ) => fn,
  };
});

import { notifyIfSlackUserIsNotAllowed } from "./workspace_limits";

const slackUserInfo: SlackUserInfo = {
  display_name: "External User",
  email: "external@example.com",
  image_512: null,
  is_bot: false,
  is_email_confirmed: false,
  is_restricted: false,
  is_stranger: true,
  is_ultra_restricted: false,
  name: "external-user",
  real_name: "External User",
  teamId: "T123",
  tz: null,
};

const slackInfos = {
  slackChannelId: "C123",
  slackMessageTs: "1700000000.000001",
  slackTeamId: "T123",
};

async function makeSlackConnector() {
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
      slackTeamId: slackInfos.slackTeamId,
    }
  );
}

function makeSlackPlatformError(error: string) {
  return Object.assign(new Error(error), {
    code: ErrorCode.PlatformError,
    data: { error, ok: false },
  });
}

describe("notifyIfSlackUserIsNotAllowed", () => {
  beforeEach(() => {
    vi.spyOn(
      DustAPI.prototype,
      "getWorkspaceVerifiedDomains"
    ).mockResolvedValue(new Ok([]));
  });

  it("returns unauthorized when Slack prevents posting the notification", async () => {
    const connector = await makeSlackConnector();
    const slackClient = new WebClient("test-token");
    vi.spyOn(slackClient.chat, "postMessage").mockRejectedValue(
      makeSlackPlatformError("restricted_action_read_only_channel")
    );

    const res = await notifyIfSlackUserIsNotAllowed(
      connector,
      slackClient,
      slackUserInfo,
      slackInfos
    );

    expect(res.isOk()).toBe(true);
    expect(res.isOk() && res.value.authorized).toBe(false);
  });

  it("propagates unexpected Slack notification errors", async () => {
    const connector = await makeSlackConnector();
    const slackClient = new WebClient("test-token");
    const error = new Error("network failure");
    vi.spyOn(slackClient.chat, "postMessage").mockRejectedValue(error);

    const res = await notifyIfSlackUserIsNotAllowed(
      connector,
      slackClient,
      slackUserInfo,
      slackInfos
    );

    expect(res.isErr()).toBe(true);
    expect(res.isErr() && res.error).toBe(error);
  });
});
