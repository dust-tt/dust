import type { ChannelPreference } from "@novu/react";

/**
 * Available delay options for email digest notifications.
 */
const VALID_DELAYS = [
  "5_minutes",
  "15_minutes",
  "30_minutes",
  "1_hour",
  "daily",
] as const;

export type NotificationPreferencesDelay = (typeof VALID_DELAYS)[number];

export const isNotificationPreferencesDelay = (
  value: unknown
): value is NotificationPreferencesDelay => {
  return (
    typeof value === "string" &&
    (VALID_DELAYS as readonly string[]).includes(value)
  );
};

export function makeNotificationPreferencesUserMetadata(
  channel: keyof ChannelPreference
): string {
  return `${channel}_notification_preferences`;
}
