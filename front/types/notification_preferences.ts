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
  "weekly",
] as const;

export type NotificationPreferencesDelay =
  (typeof NOTIFICATION_DELAY_OPTIONS)[number];

type NotificationDelayAmountConfig = {
  amount: number;
  unit: "minutes" | "hours" | "days" | "weeks";
};

/**
 * Maps delay option keys to their time configurations.
 */
export const NOTIFICATION_PREFERENCES_DELAYS: Record<
  NotificationPreferencesDelay,
  NotificationDelayAmountConfig
> = {
  "5_minutes": { amount: 5, unit: "minutes" },
  "15_minutes": { amount: 15, unit: "minutes" },
  "30_minutes": { amount: 30, unit: "minutes" },
  "1_hour": { amount: 1, unit: "hours" },
  daily: { amount: 1, unit: "days" },
  weekly: { amount: 1, unit: "weeks" },
};

export const DEFAULT_NOTIFICATION_DELAY: NotificationPreferencesDelay =
  isDevelopment() ? "5_minutes" : "weekly";

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

export const DEFAULT_NOTIFICATION_CONDITION: NotificationCondition =
  "all_messages";

export type UserPodNotificationPreference = {
  sId: string;
  spaceId: string;
  userId: string;
  preference: NotificationCondition;
};

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
export const POD_ADDED_AS_MEMBER_TRIGGER_ID =
  "project-added-as-member" as const;
export const AGENT_SUGGESTIONS_READY_TRIGGER_ID =
  "agent-suggestions-ready" as const;
export const SKILL_SUGGESTIONS_READY_TRIGGER_ID =
  "skill-suggestions-ready" as const;
export const PROVIDER_CREDENTIALS_HEALTH_UPDATED_TRIGGER_ID =
  "provider-credentials-health-updated" as const;
export const PROVIDER_CREDENTIALS_HEALTH_UPDATED_TAG =
  "provider-credentials-health" as const;

export const USER_AWU_CAP_REACHED_TRIGGER_ID = "user-awu-cap-reached" as const;
export const USER_AWU_CAP_REACHED_TAG = "user-awu-cap-reached" as const;

export const BALANCE_THRESHOLD_REACHED_TRIGGER_ID =
  "balance-threshold-reached" as const;
export const BALANCE_THRESHOLD_REACHED_TAG =
  "balance-threshold-reached" as const;

export const PROGRAMMATIC_CAP_REACHED_TRIGGER_ID =
  "programmatic-cap-reached" as const;
export const PROGRAMMATIC_CAP_REACHED_TAG = "programmatic-cap-reached" as const;

export const UPGRADE_REQUEST_CREATED_TRIGGER_ID =
  "upgrade-request-created" as const;
export const UPGRADE_REQUEST_CREATED_TAG = "upgrade-request-created" as const;

export const SEAT_AUTO_UPGRADED_TRIGGER_ID = "seat-auto-upgraded" as const;
export const SEAT_AUTO_UPGRADED_TAG = "seat-auto-upgraded" as const;

export type WorkflowTriggerId =
  | typeof CONVERSATION_UNREAD_TRIGGER_ID
  | typeof POD_ADDED_AS_MEMBER_TRIGGER_ID
  | typeof AGENT_SUGGESTIONS_READY_TRIGGER_ID
  | typeof SKILL_SUGGESTIONS_READY_TRIGGER_ID
  | typeof PROVIDER_CREDENTIALS_HEALTH_UPDATED_TRIGGER_ID
  | typeof USER_AWU_CAP_REACHED_TRIGGER_ID
  | typeof BALANCE_THRESHOLD_REACHED_TRIGGER_ID
  | typeof PROGRAMMATIC_CAP_REACHED_TRIGGER_ID
  | typeof UPGRADE_REQUEST_CREATED_TRIGGER_ID
  | typeof SEAT_AUTO_UPGRADED_TRIGGER_ID;
