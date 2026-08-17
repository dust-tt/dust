export const SLACK_CHANNEL_INTERNAL_ID_PREFIX = "slack-channel-";

type SlackPickerChannel = {
  slackChannelId: string;
  slackChannelName: string;
  sourceUrl?: string | null;
  isPrivate: boolean;
};

type SlackPickerConnectorResource = {
  internalId: string;
  title: string;
  sourceUrl?: string | null;
  providerVisibility: "public" | "private" | null;
};

type SlackPickerPrivateChannel = {
  slackChannelId: string;
  slackChannelName: string;
  sourceUrl?: string | null;
};

// Public write channels Dust can post in, plus private channels this admin and
// the Dust bot both belong to. Connector-listed private channels are excluded
// so we never show another admin's private channels.
export function buildDefaultAgentSlackPickerChannels({
  connectorResources,
  privateChannels,
}: {
  connectorResources: SlackPickerConnectorResource[];
  privateChannels: SlackPickerPrivateChannel[];
}): SlackPickerChannel[] {
  const byId = new Map<string, SlackPickerChannel>();

  for (const resource of connectorResources) {
    if (
      !resource.internalId.startsWith(SLACK_CHANNEL_INTERNAL_ID_PREFIX) ||
      resource.providerVisibility === "private"
    ) {
      continue;
    }

    const slackChannelId = resource.internalId.substring(
      SLACK_CHANNEL_INTERNAL_ID_PREFIX.length
    );
    byId.set(slackChannelId, {
      slackChannelId,
      slackChannelName: resource.title,
      sourceUrl: resource.sourceUrl,
      isPrivate: false,
    });
  }

  for (const channel of privateChannels) {
    byId.set(channel.slackChannelId, {
      slackChannelId: channel.slackChannelId,
      slackChannelName: channel.slackChannelName,
      sourceUrl: channel.sourceUrl,
      isPrivate: true,
    });
  }

  return Array.from(byId.values()).sort((a, b) =>
    a.slackChannelName.localeCompare(b.slackChannelName)
  );
}
