import { buildDefaultAgentSlackPickerChannels } from "@app/components/agent_builder/settings/buildDefaultAgentSlackPickerChannels";
import { describe, expect, it } from "vitest";

function connectorChannel({
  id,
  title,
  providerVisibility,
}: {
  id: string;
  title: string;
  providerVisibility: "public" | "private" | null;
}) {
  return {
    internalId: `slack-channel-${id}`,
    title,
    sourceUrl: `https://app.slack.com/client/T1/${id}`,
    providerVisibility,
  };
}

describe("buildDefaultAgentSlackPickerChannels", () => {
  it("keeps public connector channels and drops connector-listed private channels", () => {
    const channels = buildDefaultAgentSlackPickerChannels({
      connectorResources: [
        connectorChannel({
          id: "Cpub",
          title: "#general",
          providerVisibility: "public",
        }),
        connectorChannel({
          id: "Cpriv",
          title: "#secret",
          providerVisibility: "private",
        }),
      ],
      privateChannels: [],
    });

    expect(channels).toEqual([
      {
        slackChannelId: "Cpub",
        slackChannelName: "#general",
        sourceUrl: "https://app.slack.com/client/T1/Cpub",
        isPrivate: false,
      },
    ]);
  });

  it("adds private channels the admin and Dust bot both belong to", () => {
    const channels = buildDefaultAgentSlackPickerChannels({
      connectorResources: [
        connectorChannel({
          id: "Cpub",
          title: "#general",
          providerVisibility: "public",
        }),
        connectorChannel({
          id: "Cpriv",
          title: "#secret",
          providerVisibility: "private",
        }),
      ],
      privateChannels: [
        {
          slackChannelId: "Cpriv",
          slackChannelName: "#secret",
          sourceUrl: "https://app.slack.com/client/T1/Cpriv",
        },
        {
          slackChannelId: "Cmine",
          slackChannelName: "#mine",
          sourceUrl: "https://app.slack.com/client/T1/Cmine",
        },
      ],
    });

    expect(channels.map((c) => c.slackChannelId)).toEqual([
      "Cpub",
      "Cmine",
      "Cpriv",
    ]);
    expect(channels.find((c) => c.slackChannelId === "Cpriv")?.isPrivate).toBe(
      true
    );
    expect(channels.find((c) => c.slackChannelId === "Cmine")?.isPrivate).toBe(
      true
    );
  });
});
