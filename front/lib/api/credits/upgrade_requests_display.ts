import type { SpendLimitExpiryKind } from "@app/types/api/users/spend_limit";
import type {
  MembershipSeatType,
  MembershipUpgradeRequestType,
} from "@app/types/memberships";
import { seatTypeDisplayName } from "@app/types/memberships";
import {
  assertNever,
  assertNeverAndIgnore,
} from "@app/types/shared/utils/assert_never";

// Shareable to avoid unintentional behavior drift

export const UPGRADE_REQUEST_REASON_LABEL = "Reached credit limit";

export function formatUpgradeRequestDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function upgradeRequestDurationLabel(
  expiryKind: SpendLimitExpiryKind | null
): string | null {
  if (expiryKind === null) {
    return null;
  }
  switch (expiryKind) {
    case "one_day":
      return "1 day";
    case "next_credit_reset":
      return "Until next billing";
    case "never":
      return "Forever";
    default:
      assertNeverAndIgnore(expiryKind);
      return null;
  }
}

export type UpgradeRequestGrant =
  | { kind: "none" }
  | { kind: "seat_upgrade"; seatType: MembershipSeatType }
  | { kind: "unlimited_spend" }
  | { kind: "credits"; amountAwuCredits: number };

export function upgradeRequestGrant(
  request: MembershipUpgradeRequestType
): UpgradeRequestGrant {
  const { status, grantedAwuCredits, grantedUnlimitedSpend, grantedSeatType } =
    request;

  if (status !== "approved") {
    return { kind: "none" };
  }
  if (grantedSeatType) {
    return { kind: "seat_upgrade", seatType: grantedSeatType };
  }
  if (grantedUnlimitedSpend) {
    return { kind: "unlimited_spend" };
  }
  if (grantedAwuCredits !== null) {
    return { kind: "credits", amountAwuCredits: grantedAwuCredits };
  }
  return { kind: "none" };
}

export function upgradeRequestGrantedLabel(grant: UpgradeRequestGrant): string {
  switch (grant.kind) {
    case "none":
      return "—";
    case "seat_upgrade":
      return `Upgraded to ${seatTypeDisplayName(grant.seatType)}`;
    case "unlimited_spend":
      return "Unlimited spend";
    case "credits":
      return `${grant.amountAwuCredits.toLocaleString("en-US")} credits`;
    default:
      return assertNever(grant);
  }
}

export function upgradeRequestUntilLabel(
  request: MembershipUpgradeRequestType
): string {
  const {
    status,
    grantedAwuCredits,
    grantedExpiryKind,
    grantedUnlimitedSpend,
    grantedSeatType,
  } = request;

  const hasGrant =
    grantedAwuCredits !== null || grantedUnlimitedSpend || grantedSeatType;
  if (status !== "approved" || !hasGrant) {
    return "—";
  }
  if (grantedSeatType || grantedUnlimitedSpend) {
    return "Forever";
  }
  return upgradeRequestDurationLabel(grantedExpiryKind) ?? "—";
}

export function upgradeRequestStatusLabel(
  status: MembershipUpgradeRequestType["status"]
): string {
  return status === "approved" ? "Approved" : "Denied";
}
