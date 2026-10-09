import { MembersUsageTable } from "@app/components/workspace/MembersUsageTable";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { makeMemberUsage } from "@app/tests/utils/MemberUsageFactory";
import { makeSharedUsageLimitUsage } from "@app/tests/utils/SharedUsageLimitUsageFactory";
import type { SharedUsageLimitWithUsage } from "@app/types/api/groups/shared_usage_limit";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const NOW = new Date("2026-10-09T12:00:00Z");
const EMPTY_IDS = new Set<string>();
const SALES_USAGE = makeSharedUsageLimitUsage({
  groupId: "sales",
  limitAwuCredits: 5_000,
  usedAwuCredits: 1_725,
});
const SALES_MEMBER = makeMemberUsage({
  sharedUsageLimitGroup: { kind: "visible", groupId: "sales", name: "Sales" },
});

function renderTable({
  members,
  creditsResetAt = "2026-10-18T00:00:00Z",
  salesUsage = SALES_USAGE,
}: {
  members: MemberUsageType[];
  creditsResetAt?: string | null;
  salesUsage?: SharedUsageLimitWithUsage;
}) {
  render(
    <MembersUsageTable
      members={members}
      isLoading={false}
      totalAllowedUsagePendingMemberIds={EMPTY_IDS}
      seatChangePendingMemberIds={EMPTY_IDS}
      isSeatBased={false}
      showSpendLimit={false}
      showSeatAndCredits={false}
      showSharedUsageLimitGroupColumn
      sharedUsageLimitUsageByGroupId={new Map([["sales", salesUsage]])}
      creditsResetAt={creditsResetAt}
      onChangeSeat={vi.fn()}
      onRemoveSeat={vi.fn()}
      onEditSpendLimit={vi.fn()}
      pagination={{ pageIndex: 0, pageSize: 25 }}
      setPagination={vi.fn()}
      totalRowCount={members.length}
      sorting={[]}
      setSorting={vi.fn()}
    />
  );
}

describe("MembersUsageTable group budget column", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the budget usage and reset delay on hover", async () => {
    renderTable({ members: [SALES_MEMBER] });

    const trigger = screen.getByText("Sales").parentElement;
    expect(trigger).toHaveAttribute("data-state", "closed");

    await userEvent.hover(screen.getByText("Sales"));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "34% used, resets in 9 days"
    );
  });

  it("omits the reset delay when the reset date is unknown", async () => {
    renderTable({ members: [SALES_MEMBER], creditsResetAt: null });

    await userEvent.hover(screen.getByText("Sales"));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(/^34% used$/);
  });

  it("shows no tooltip for a budget group the caller cannot read", () => {
    renderTable({
      members: [makeMemberUsage({ sharedUsageLimitGroup: { kind: "hidden" } })],
    });

    expect(screen.getByText("Another group")).not.toHaveAttribute("data-state");
  });

  it("shows no pace icon when the budget is on target", () => {
    renderTable({ members: [SALES_MEMBER] });

    expect(
      screen.getByText("Sales").parentElement?.querySelector("svg")
    ).toBeNull();
  });

  it.each([
    { usageTarget: "elevated" as const, colorClass: "text-warning-500" },
    { usageTarget: "critical" as const, colorClass: "text-red-500" },
  ])(
    "shows the pace icon when the budget is $usageTarget",
    ({ usageTarget, colorClass }) => {
      renderTable({
        members: [SALES_MEMBER],
        salesUsage: { ...SALES_USAGE, usageTarget },
      });

      expect(
        screen.getByText("Sales").parentElement?.querySelector("svg")
      ).toHaveClass(colorClass);
    }
  );
});
