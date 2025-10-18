import _ from "lodash";

import type { SlackChannel } from "@connectors/lib/models/slack";
import type { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";

export function getWeekStart(date: Date): Date {
  const dateCopy = new Date(date);

  dateCopy.setHours(0);
  dateCopy.setMinutes(0);
  dateCopy.setSeconds(0);
  dateCopy.setMilliseconds(0);
  const diff =
    dateCopy.getDate() - dateCopy.getDay() + (dateCopy.getDay() === 0 ? -6 : 1);
  return new Date(dateCopy.setDate(diff));
}

export function getWeekEnd(date: Date): Date {
  const dateCopy = new Date(date);
  dateCopy.setHours(0);
  dateCopy.setMinutes(0);
  dateCopy.setSeconds(0);
  dateCopy.setMilliseconds(0);
  const diff =
    dateCopy.getDate() - dateCopy.getDay() + (dateCopy.getDay() === 0 ? -6 : 1);
  return new Date(dateCopy.setDate(diff + 7));
}

export const timeAgoFrom = (millisSinceEpoch: number) => {
  // return the duration elapsed from the given time to now in human readable format (using seconds, minutes, days)
  const now = new Date().getTime();
  const diff = now - millisSinceEpoch;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  if (years > 0) {
    return years + "y";
  }
  if (months > 0) {
    return months + "m";
  }
  if (days > 0) {
    return days + "d";
  }
  if (hours > 0) {
    return hours + "h";
  }
  if (minutes > 0) {
    return minutes + "m";
  }
  return seconds + "s";
};

export type SlackChannelInternalId = string;
export type SlackThreadInternalId = string;
export type SlackNonThreadedMessagesInternalId = string;

export function isSlackChannelInternalId(
  internalId: string
): internalId is SlackChannelInternalId {
  return internalId.startsWith("slack-channel-");
}

export function isSlackThreadInternalId(
  internalId: string
): internalId is SlackThreadInternalId {
  return internalId.startsWith("slack-") && internalId.includes("-thread-");
}

export function isSlackNonThreadedMessagesInternalId(
  internalId: string
): internalId is SlackNonThreadedMessagesInternalId {
  return internalId.startsWith("slack-") && internalId.includes("-messages-");
}

export function slackChannelInternalIdFromSlackChannelId(
  channel: string
): SlackChannelInternalId {
  return `slack-channel-${_.last(channel.split("slack-channel-"))!}`;
}

export function slackChannelIdFromInternalId(nodeId: SlackChannelInternalId) {
  return _.last(nodeId.split("slack-channel-"))!;
}

export type SlackThreadIdentifier = {
  channelId: string;
  threadTs: string;
};

export function slackThreadInternalIdFromSlackThreadIdentifier({
  channelId,
  threadTs,
}: SlackThreadIdentifier): SlackThreadInternalId {
  return `slack-${channelId}-thread-${threadTs}`;
}

export type SlackNonThreadedMessagesIdentifier = {
  channelId: string;
  startDate: Date;
  endDate: Date;
};

export function slackNonThreadedMessagesInternalIdFromSlackNonThreadedMessagesIdentifier({
  channelId,
  startDate,
  endDate,
}: SlackNonThreadedMessagesIdentifier): SlackNonThreadedMessagesInternalId {
  const startDateStr = `${startDate.getFullYear()}-${startDate.getMonth()}-${startDate.getDate()}`;
  const endDateStr = `${endDate.getFullYear()}-${endDate.getMonth()}-${endDate.getDate()}`;
  return `slack-${channelId}-messages-${startDateStr}-${endDateStr}`;
}

export function getSlackChannelSourceUrl(
  slackChannelId: string,
  slackConfig: SlackConfigurationResource
): `https://app.slack.com/client/${SlackConfigurationResource["slackTeamId"]}/${SlackChannel["slackChannelId"]}` {
  return `https://app.slack.com/client/${slackConfig.slackTeamId}/${slackChannelId}`;
}

// Extract a tag from a list of tags. The tag is formatted as `tagPrefix:${tagValue}`.
export function extractFromTags({
  tagPrefix,
  tags,
}: {
  tagPrefix: string;
  tags: string[];
}) {
  return (
    tags
      .find((t) => t.startsWith(tagPrefix))
      ?.split(":")
      .slice(1)
      .join(":") ?? ""
  );
}
