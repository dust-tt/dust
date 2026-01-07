import type { ChannelPreference } from "@novu/react";

/**
 * Available delay options for email digest notifications.
 */
export const NOTIFICATION_DELAY_OPTIONS = [
  "5_minutes",
  "15_minutes",
  "30_minutes",
  "1_hour",
  "daily",
] as const;

export type NotificationPreferencesDelay =
  (typeof NOTIFICATION_DELAY_OPTIONS)[number];

export const isNotificationPreferencesDelay = (
  value: unknown
): value is NotificationPreferencesDelay => {
  return (
    typeof value === "string" &&
    (NOTIFICATION_DELAY_OPTIONS as readonly string[]).includes(value)
  );
};

export function makeNotificationPreferencesUserMetadata(
  channel: keyof ChannelPreference
): string {
  return `${channel}_notification_preferences`;
}

/**
 * Mention-based notification trigger options.
 */
export const NOTIFICATION_TRIGGER_OPTIONS = [
  "all_messages",
  "only_mentions",
] as const;

export type NotificationTrigger =
  (typeof NOTIFICATION_TRIGGER_OPTIONS)[number];

export const isNotificationTrigger = (
  value: unknown
): value is NotificationTrigger => {
  return (
    typeof value === "string" &&
    (NOTIFICATION_TRIGGER_OPTIONS as readonly string[]).includes(value)
  );
};

/**
 * User metadata keys for conversation notification preferences.
 */
export const CONVERSATION_NOTIFICATION_METADATA_KEYS = {
  unreadTrigger: "conversation_unread_trigger",
  notifyTrigger: "conversation_notify_trigger",
} as const;
