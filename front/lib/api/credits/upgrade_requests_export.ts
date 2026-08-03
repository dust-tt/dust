import { rowsToCsv } from "@app/lib/api/analytics/csv_utils";
import type { SpendLimitExpiryKind } from "@app/types/api/users/spend_limit";
import type {
  MembershipSeatType,
  MembershipUpgradeRequestType,
} from "@app/types/memberships";
import { toBaseSeatType } from "@app/types/memberships";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";

// Mirrors what the History tab's table actually renders (see
// `UpgradeRequestsHistoryTable`), not the raw request fields — dates are
// formatted the same way, "Granted"/"For" are the same derived labels, and a
// missing reason falls back to the same default copy shown in the UI.
export interface UpgradeRequestExportRow {
  requesterName: string;
  requesterEmail: string;
  requestedAt: string;
  granted: string;
  until: string;
  reason: string;
  status: string;
  resolvedAt: string;
  resolvedBy: string;
}

export const UPGRADE_REQUEST_EXPORT_HEADERS: (keyof UpgradeRequestExportRow)[] =
  [
    "requesterName",
    "requesterEmail",
    "requestedAt",
    "granted",
    "until",
    "reason",
    "status",
    "resolvedAt",
    "resolvedBy",
  ];

const REASON_LABEL = "Reached credit limit";

// Same display names as `seatTypeDisplayName`
// (front/components/workspace/billing/seatTypeUtils.ts) — duplicated here so
// this business-layer module doesn't depend on a UI component file.
const SEAT_TYPE_DISPLAY_NAMES: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  max: "Max",
  workspace: "Platform",
  none: "None",
};

function seatTypeDisplayName(seatType: MembershipSeatType): string {
  const base = toBaseSeatType(seatType);
  return SEAT_TYPE_DISPLAY_NAMES[base] ?? base;
}

function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDateOrEmpty(epochMs: number | null): string {
  return epochMs === null ? "—" : formatDate(epochMs);
}

function durationLabel(expiryKind: SpendLimitExpiryKind | null): string {
  if (expiryKind === null) {
    return "—";
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
      return "—";
  }
}

function grantedLabel(request: MembershipUpgradeRequestType): string {
  const { status, grantedAwuCredits, grantedUnlimitedSpend, grantedSeatType } =
    request;

  if (status !== "approved") {
    return "—";
  }
  if (grantedSeatType) {
    return `Upgraded to ${seatTypeDisplayName(grantedSeatType)}`;
  }
  if (grantedUnlimitedSpend) {
    return "Unlimited spend";
  }
  if (grantedAwuCredits !== null) {
    return `${grantedAwuCredits.toLocaleString("en-US")} credits`;
  }
  return "—";
}

function untilLabel(request: MembershipUpgradeRequestType): string {
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
  return durationLabel(grantedExpiryKind);
}

function statusLabel(status: MembershipUpgradeRequestType["status"]): string {
  return status === "approved" ? "Approved" : "Denied";
}

export function toUpgradeRequestExportRow(
  request: MembershipUpgradeRequestType
): UpgradeRequestExportRow {
  return {
    requesterName: request.requester.name,
    requesterEmail: request.requester.email ?? "",
    requestedAt: formatDate(request.createdAt),
    granted: grantedLabel(request),
    until: untilLabel(request),
    reason: request.reason ?? REASON_LABEL,
    status: statusLabel(request.status),
    resolvedAt: formatDateOrEmpty(request.resolvedAt),
    resolvedBy: request.resolvedBy?.name ?? "—",
  };
}

export function upgradeRequestsToCsv(
  requests: MembershipUpgradeRequestType[]
): string {
  return rowsToCsv(
    UPGRADE_REQUEST_EXPORT_HEADERS,
    requests.map(toUpgradeRequestExportRow)
  );
}
