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
  channel: keyof ChannelPreference,
  workflowTriggerId?: WorkflowTriggerId
): string {
  if (workflowTriggerId) {
    return `${workflowTriggerId}_${channel}_notification_preferences`;
  }
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

export const WORKFLOW_TRIGGER_IDS = {
  CONVERSATION_UNREAD: "conversation-unread",
  CONVERSATION_ADDED_AS_PARTICIPANT: "conversation-added-as-participant",
  PROJECT_ADDED_AS_MEMBER: "project-added-as-member",
  PROJECT_NEW_CONVERSATION: "project-new-conversation",
} as const;

export type WorkflowTriggerId =
  (typeof WORKFLOW_TRIGGER_IDS)[keyof typeof WORKFLOW_TRIGGER_IDS];
