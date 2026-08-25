import { UsageFilterPanel } from "@app/components/workspace/analytics/UsageFilterPanel";
import type { LightWorkspaceType } from "@app/types/user";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseConsumptionFacets } = vi.hoisted(() => ({
  mockUseConsumptionFacets: vi.fn(),
}));

vi.mock("@app/hooks/useConsumptionFacets", () => ({
  useConsumptionFacets: mockUseConsumptionFacets,
}));

vi.mock("@app/lib/swr/groups", () => ({
  useGroups: () => ({ groups: [] }),
}));

describe("UsageFilterPanel", () => {
  beforeEach(() => {
    mockUseConsumptionFacets.mockReturnValue({
      options: {
        agent: [],
        member: [],
        group: [],
        model: [],
        tool: [],
        skill: [],
        source: [],
        api_key: [],
      },
      isFacetsLoading: false,
      isFacetsError: undefined,
      isFacetsValidating: false,
    });
  });

  it("hides member and group filters in the personal view", async () => {
    const user = userEvent.setup();
    render(
      <UsageFilterPanel
        owner={{ sId: "workspace-id" } as LightWorkspaceType}
        period={{ kind: "days", days: 30 }}
        filter={{}}
        personal
        onFilterChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Filters" }));

    expect(screen.getByRole("tab", { name: "Agents" })).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Members" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Groups" })
    ).not.toBeInTheDocument();
  });
});
