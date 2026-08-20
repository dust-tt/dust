import type { GroupType } from "@app/types/groups";
import {
  AGENT_GROUP_PREFIX,
  GLOBAL_SPACE_NAME,
  SPACE_GROUP_PREFIX,
} from "@app/types/groups";
import { z } from "zod";

export const KEY_ROLES = ["user", "admin"] as const;
export type KeyRole = (typeof KEY_ROLES)[number];

export const isKeyRole = (value: string): value is KeyRole =>
  (KEY_ROLES as readonly string[]).includes(value);

/**
 * Schema for monthly cap input in dollars (as string from input).
 * - Empty string → valid (unlimited)
 * - Valid positive decimal number → valid
 * - Rejects scientific notation (e.g., "1e5"), letters, negative numbers
 */
export const monthlyCapDollarsSchema = z.string().refine(
  (value) => {
    if (value === "") {
      return true;
    }
    // Only allow digits and optional decimal point (no scientific notation)
    // Must have at least one digit (reject "." alone)
    if (!/^\d*\.?\d*$/.test(value) || !/\d/.test(value)) {
      return false;
    }
    const num = parseFloat(value);
    return !isNaN(num) && num >= 0;
  },
  { message: "Monthly cap must be a positive number" }
);

export function microUsdToDollarsString(microUsd: number | null): string {
  if (microUsd === null) {
    return "";
  }
  return (microUsd / 1_000_000).toString();
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
export const monthlyCapCreditsSchema = z.string().refine(
  (value) => {
    if (value === "") {
      return true;
    }
    if (!/^\d+$/.test(value)) {
      return false;
    }
    return parseInt(value, 10) >= 1;
  },
  { message: "Credit cap must be a whole number of credits (min 1)" }
);

export function creditsToString(credits: number | null): string {
  return credits === null ? "" : credits.toString();
}

export function parseCreditsString(value: string): number | null {
  return value === "" ? null : parseInt(value, 10);
}

export const prettifyGroupName = (group: GroupType) => {
  if (group.kind === "global") {
    return GLOBAL_SPACE_NAME;
  }

  if (group.kind === "agent_editors") {
    return group.name.replace(AGENT_GROUP_PREFIX, "");
  }

  return group.name.replace(SPACE_GROUP_PREFIX, "");
};
