import { normalizeDecimalSeparator } from "@app/lib/i18n/format";
import type { KeyType } from "@app/types/key";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { RoleType } from "@app/types/user";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { z } from "zod";

export const KEY_ROLES = ["user", "admin"] as const;
export type KeyRole = (typeof KEY_ROLES)[number];

export const isKeyRole = (value: string): value is KeyRole =>
  (KEY_ROLES as readonly string[]).includes(value);

export type APIKeyStatus = "active" | "capped" | "revoked";

export const API_KEY_STATUS_LABELS: Record<APIKeyStatus, MessageDescriptor> = {
  active: msg({ message: "Active", context: "API key status" }),
  capped: msg`Capped`,
  revoked: msg({ message: "Revoked", context: "API key status" }),
};

export const API_KEY_STATUS_CHIP_COLORS = {
  active: "success",
  capped: "warning",
  revoked: "primary",
} as const satisfies Record<APIKeyStatus, string>;

export function getKeyScopeLabel(role: RoleType): MessageDescriptor {
  switch (role) {
    case "user":
      return msg`Read-only`;
    case "manager":
      return msg`Read & write`;
    case "admin":
      return msg`Admin`;
    case "none":
      return msg`No access`;
    default:
      assertNeverAndIgnore(role);
      return msg`Unknown`;
  }
}

export function getKeyStatus(key: KeyType): APIKeyStatus {
  if (key.status !== "active") {
    return "revoked";
  }
  return key.isSpendCapped ? "capped" : "active";
}

/**
 * Schema for monthly cap input in dollars (as string from input).
 * - Empty string → valid (unlimited)
 * - Valid positive decimal number → valid
 * - Rejects scientific notation (e.g., "1e5"), letters, negative numbers
 */
export function getMonthlyCapDollarsSchema(
  t: (descriptor: MessageDescriptor) => string
) {
  return z.string().refine(
    (value) => {
      if (value === "") {
        return true;
      }
      const normalized = normalizeDecimalSeparator(value);
      // Only allow digits and optional decimal point (no scientific notation)
      // Must have at least one digit (reject "." alone)
      if (!/^\d*\.?\d*$/.test(normalized) || !/\d/.test(normalized)) {
        return false;
      }
      const num = parseFloat(normalized);
      return !isNaN(num) && num >= 0;
    },
    { message: t(msg`Monthly cap must be a positive number`) }
  );
}

export function microUsdToDollarsString(microUsd: number | null): string {
  if (microUsd === null) {
    return "";
  }
  return (microUsd / 1_000_000).toString();
}

export function parseDollarsString(value: string): number | null {
  return value === "" ? null : parseFloat(normalizeDecimalSeparator(value));
}

export function dollarsToMicroUsd(dollars: number | null): number | null {
  if (dollars === null) {
    return null;
  }
  return Math.round(dollars * 1_000_000);
}

/**
 * Schema for the per-key credit cap input (credit-priced plans), as a string
 * from the input. Empty → unlimited. Otherwise a whole number of AWU credits
 * (min 1) — no decimals or scientific notation.
 */
export function getMonthlyCapCreditsSchema(
  t: (descriptor: MessageDescriptor) => string
) {
  return z.string().refine(
    (value) => {
      if (value === "") {
        return true;
      }
      if (!/^\d+$/.test(value)) {
        return false;
      }
      return parseInt(value, 10) >= 1;
    },
    { message: t(msg`Credit cap must be a whole number of credits (min 1)`) }
  );
}

export function creditsToString(credits: number | null): string {
  return credits === null ? "" : credits.toString();
}

export function parseCreditsString(value: string): number | null {
  return value === "" ? null : parseInt(value, 10);
}
