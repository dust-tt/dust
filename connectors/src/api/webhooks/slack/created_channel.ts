import type { ConnectorProvider, Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

import type { SlackWebhookEvent } from "@connectors/api/webhooks/slack/utils";
import { autoReadChannel } from "@connectors/connectors/slack/auto_read_channel";
import type { Logger } from "@connectors/logger/logger";

interface ChannelCreatedEventPayload {
  context_team_id: string;
  created: number;
  creator: string;
  id: string;
  name: string;
}

type ChannelCreatedEvent = SlackWebhookEvent<ChannelCreatedEventPayload>;

export function isChannelCreatedEvent(
  event: unknown
): event is ChannelCreatedEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    "channel" in event &&
    typeof event.channel === "object" &&
    event.channel !== null &&
    "context_team_id" in event.channel &&
    "created" in event.channel &&
    "creator" in event.channel &&
    "id" in event.channel &&
    "name" in event.channel
  );
}

interface OnChannelCreationInterface {
  event: ChannelCreatedEvent;
  logger: Logger;
  provider?: Extract<ConnectorProvider, "slack_bot" | "slack">;
}

export async function onChannelCreation({
  event,
  logger,
  provider = "slack",
}: OnChannelCreationInterface): Promise<Result<void, Error>> {
  const { channel } = event;
  if (!channel) {
    return new Err(
      new Error("Missing channel in request body for message event")
    );
  }
  const autoReadRes = await autoReadChannel(
    channel.context_team_id,
    logger,
    channel.id,
    provider
  );
  if (autoReadRes.isErr()) {
    return new Err(
      new Error(`Error joining slack channel: ${autoReadRes.error}`)
    );
  }
  return new Ok(undefined);
}
