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
 * Notification condition options (determines when to send notifications).
 * Includes "never" to allow disabling notifications entirely.
 */
export const NOTIFICATION_CONDITION_OPTIONS = [
  "all_messages",
  "only_mentions",
  "never",
] as const;

export type NotificationCondition =
  (typeof NOTIFICATION_CONDITION_OPTIONS)[number];

export const isNotificationCondition = (
  value: unknown
): value is NotificationCondition => {
  return (
    typeof value === "string" &&
    (NOTIFICATION_CONDITION_OPTIONS as readonly string[]).includes(value)
  );
};

/**
 * User metadata keys for conversation notification preferences.
 */
export const CONVERSATION_NOTIFICATION_METADATA_KEYS = {
  notifyCondition: "conversation_notify_condition",
} as const;

/**
 * Novu workflow trigger ID for conversation unread notifications.
 */
export const CONVERSATION_UNREAD_TRIGGER_ID = "conversation-unread";

/**
 * Novu workflow trigger ID for project added as member notifications.
 */
export const PROJECT_ADDED_AS_MEMBER_TRIGGER_ID = "project-added-as-member";

/**
 * Novu workflow trigger ID for project new conversation notifications.
 */
export const PROJECT_NEW_CONVERSATION_TRIGGER_ID = "project-new-conversation";
