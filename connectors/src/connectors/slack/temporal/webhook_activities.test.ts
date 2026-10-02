import { onChannelCreation } from "@connectors/api/webhooks/slack/created_channel";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { Ok } from "@dust-tt/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@connectors/api/webhooks/slack/created_channel", () => ({
  onChannelCreation: vi.fn(),
}));

import { processSlackWebhookEventActivity } from "./webhook_activities";

async function makeSlackConnector(slackTeamId: string) {
  return ConnectorResource.makeNew(
    "slack",
    {
      connectionId: `connection-${slackTeamId}`,
      dataSourceId: `data-source-${slackTeamId}`,
      workspaceAPIKey: "workspace-api-key",
      workspaceId: `workspace-${slackTeamId}`,
    },
    {
      autoReadChannelPatterns: [],
      botEnabled: false,
      feedbackVisibleToAuthorOnly: true,
      restrictedSpaceAgentsEnabled: true,
      slackTeamId,
    }
  );
}

describe("processSlackWebhookEventActivity channel_created", () => {
  beforeEach(() => {
    vi.mocked(onChannelCreation).mockResolvedValue(new Ok(undefined));
  });

  it("auto-reads a channel created in the verified team", async () => {
    await makeSlackConnector("T_OWN");

    await processSlackWebhookEventActivity({
      event: {
        type: "channel_created",
        channelId: "C1",
        contextTeamId: "T_OWN",
      },
      teamId: "T_OWN",
    });

    expect(onChannelCreation).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "C1", contextTeamId: "T_OWN" })
    );
  });

  it("ignores a channel whose context team differs from the verified team", async () => {
    await makeSlackConnector("T_OWN");
    await makeSlackConnector("T_OTHER");

    await processSlackWebhookEventActivity({
      event: {
        type: "channel_created",
        channelId: "C1",
        contextTeamId: "T_OTHER",
      },
      teamId: "T_OWN",
    });

    expect(onChannelCreation).not.toHaveBeenCalled();
  });
});
