import { GroupsUsageTable } from "@app/components/workspace/GroupsUsageTable";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import type { CreditUsageTarget } from "@app/types/api/credits/usage_status";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  usageTarget: null as CreditUsageTarget | null,
}));

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

vi.mock("@app/components/workspace/EditGroupUsageDialog", () => ({
  EditGroupUsageDialog: () => null,
}));

vi.mock("@app/lib/swr/groups", async () => {
  const { LightGroupFactory } =
    await import("@app/tests/utils/LightGroupFactory");
  const groups = [
    LightGroupFactory.build({ sId: "sales", name: "Sales", memberCount: 3 }),
  ];
  return { useGroups: () => ({ groups, isGroupsLoading: false }) };
});

vi.mock("@app/hooks/useGroupsUsage", async () => {
  const { makeSharedUsageLimitUsage } =
    await import("@app/tests/utils/SharedUsageLimitUsageFactory");
  return {
    useGroupsUsage: () => ({
      usageByGroupId: new Map([
        [
          "sales",
          makeSharedUsageLimitUsage({
            groupId: "sales",
            usedAwuCredits: 1_725,
            usageTarget: mocks.usageTarget,
          }),
        ],
      ]),
      isGroupsUsageLoading: false,
      isGroupsUsageError: false,
    }),
  };
});

function renderTable(usageTarget: CreditUsageTarget) {
  mocks.usageTarget = usageTarget;
  const { container } = render(
    <GroupsUsageTable
      owner={LightWorkspaceFactory.build()}
      showSharedUsageLimitColumn
    />
  );
  return container;
}

describe("GroupsUsageTable group budget pace", () => {
  it.each([
    {
      usageTarget: "elevated" as const,
      colorClass: "text-warning-500",
      tooltip: "Consuming the group budget ahead of the billing cycle's pace",
    },
    {
      usageTarget: "critical" as const,
      colorClass: "text-red-500",
      tooltip:
        "At this rate, this group will use its whole budget before the cycle ends and its members will lose access to Dust until it resets.",
    },
  ])(
    "shows the pace icon and its tooltip when the budget is $usageTarget",
    async ({ usageTarget, colorClass, tooltip }) => {
      const icon = renderTable(usageTarget).querySelector(`.${colorClass}`);
      expect(icon).not.toBeNull();

      await userEvent.hover(icon!);

      expect(await screen.findByRole("tooltip")).toHaveTextContent(tooltip);
    }
  );
});
