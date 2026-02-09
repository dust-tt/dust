import type { ChannelPreference } from "@novu/react";

import { isDevelopment } from "./shared/env";

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

type NotificationDelayAmountConfig = {
  amount: number;
  unit: "minutes" | "hours" | "days";
};

type NotificationDelayCronConfig = { cron: string };

type NotificationDelayConfig =
  | NotificationDelayAmountConfig
  | NotificationDelayCronConfig;

/**
 * Maps delay option keys to their time configurations.
 */
export const NOTIFICATION_PREFERENCES_DELAYS: Record<
  NotificationPreferencesDelay,
  NotificationDelayConfig
> = {
  "5_minutes": { amount: 5, unit: "minutes" },
  "15_minutes": { amount: 15, unit: "minutes" },
  "30_minutes": { amount: 30, unit: "minutes" },
  "1_hour": { amount: 1, unit: "hours" },
  daily: { cron: "0 6 * * *" }, // Every day at 6am
};

export const DEFAULT_NOTIFICATION_DELAY: NotificationPreferencesDelay =
  isDevelopment() ? "5_minutes" : "1_hour";

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

export const CONVERSATION_UNREAD_TRIGGER_ID = "conversation-unread" as const;
export const CONVERSATION_ADDED_AS_PARTICIPANT_TRIGGER_ID =
  "conversation-added-as-participant" as const;
export const PROJECT_ADDED_AS_MEMBER_TRIGGER_ID =
  "project-added-as-member" as const;
export const PROJECT_NEW_CONVERSATION_TRIGGER_ID =
  "project-new-conversation" as const;

type WorkflowTriggerId =
  | typeof CONVERSATION_UNREAD_TRIGGER_ID
  | typeof CONVERSATION_ADDED_AS_PARTICIPANT_TRIGGER_ID
  | typeof PROJECT_ADDED_AS_MEMBER_TRIGGER_ID
  | typeof PROJECT_NEW_CONVERSATION_TRIGGER_ID;
