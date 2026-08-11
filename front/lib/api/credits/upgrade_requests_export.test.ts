import { UPGRADE_REQUEST_REASON_LABEL } from "@app/lib/api/credits/upgrade_requests_display";
import {
  toUpgradeRequestExportRow,
  UPGRADE_REQUEST_EXPORT_HEADERS,
  upgradeRequestsToCsv,
} from "@app/lib/api/credits/upgrade_requests_export";
import type { MembershipUpgradeRequestType } from "@app/types/memberships";
import { describe, expect, it } from "vitest";

function baseRequest(
  overrides: Partial<MembershipUpgradeRequestType> = {}
): MembershipUpgradeRequestType {
  return {
    sId: "upr_test_xxx",
    status: "denied",
    createdAt: Date.parse("2026-01-01T00:00:00Z"),
    resolvedAt: Date.parse("2026-01-02T00:00:00Z"),
    reason: "Need more credits",
    requester: {
      sId: "user_test_xxx",
      name: "Test Requester",
      email: "requester@example.com",
      image: null,
      seatType: null,
    },
    resolvedBy: {
      sId: "user_admin_xxx",
      name: "Test Admin",
      image: null,
    },
    grantedAwuCredits: null,
    grantedExpiryKind: null,
    grantedUnlimitedSpend: false,
    grantedSeatType: null,
    ...overrides,
  };
}

describe("toUpgradeRequestExportRow", () => {
  it("falls back to the default label for an empty-string reason, like the History table does", () => {
    const row = toUpgradeRequestExportRow(baseRequest({ reason: "" }));
    expect(row.reason).toBe(UPGRADE_REQUEST_REASON_LABEL);
  });

  it("falls back to the default label for a null reason", () => {
    const row = toUpgradeRequestExportRow(baseRequest({ reason: null }));
    expect(row.reason).toBe(UPGRADE_REQUEST_REASON_LABEL);
  });

  it("preserves a non-empty reason", () => {
    const row = toUpgradeRequestExportRow(
      baseRequest({ reason: "Need more credits" })
    );
    expect(row.reason).toBe("Need more credits");
  });
});

describe("upgradeRequestsToCsv", () => {
  it("emits the export headers followed by one row per request", () => {
    const csv = upgradeRequestsToCsv([baseRequest()]);
    const [header, row] = csv.trim().split("\n");
    expect(header).toBe(UPGRADE_REQUEST_EXPORT_HEADERS.join(","));
    expect(row).toContain("requester@example.com");
  });
});
