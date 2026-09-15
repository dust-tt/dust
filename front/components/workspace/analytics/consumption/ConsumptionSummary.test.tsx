import { ConsumptionSummary } from "@app/components/workspace/analytics/consumption/ConsumptionSummary";
import type { ConsumptionAnalyticsScope } from "@app/lib/analytics/consumption_scope";
import type { GetConsumptionOverviewResponse } from "@app/lib/api/analytics/consumption/overview";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseConsumptionOverview } = vi.hoisted(() => ({
  mockUseConsumptionOverview: vi.fn(),
}));

vi.mock("@app/hooks/useConsumptionOverview", () => ({
  useConsumptionOverview: mockUseConsumptionOverview,
}));

const period = { kind: "days", days: 30 } as const;
const agentAnalyticsScope: ConsumptionAnalyticsScope = {
  kind: "agent",
  agentId: "agent-1",
};

const overview: GetConsumptionOverviewResponse = {
  period: {
    startDate: "2026-08-01T00:00:00.000Z",
    endDate: "2026-08-31T23:59:59.999Z",
  },
  members: { active: 2, total: 2 },
  messageCount: 566,
  lastRecordAt: "2026-08-25T10:00:00.000Z",
  totalCredits: 100,
  topAgent: { agentId: "agent-1", name: "Research agent", credits: 100 },
  creditUsage: null,
};

describe("ConsumptionSummary", () => {
  beforeEach(() => {
    mockUseConsumptionOverview.mockReturnValue({
      overview,
      isOverviewLoading: false,
      isOverviewError: undefined,
    });
  });

  it("shows activity and cost metrics in an agent-scoped summary", () => {
    const { container } = render(
      <ConsumptionSummary
        workspaceId="workspace-id"
        period={period}
        analyticsScope={agentAnalyticsScope}
      />
    );

    expect(mockUseConsumptionOverview).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-id",
        analyticsScope: agentAnalyticsScope,
      })
    );
    expect(screen.getByText("Active Users")).toBeInTheDocument();
    expect(screen.getByText("Messages / active user")).toBeInTheDocument();
    expect(screen.getByText("283")).toBeInTheDocument();
    expect(screen.getByText("Total cost")).toBeInTheDocument();
    expect(screen.getByText("100 credits")).toBeInTheDocument();
    expect(screen.getByText("Avg. cost/msg")).toBeInTheDocument();
    expect(screen.getByText("0.2 credits")).toBeInTheDocument();
    const activeUsersCard = screen
      .getByText("Active Users")
      .closest(".bg-panel-background");
    expect(activeUsersCard).toHaveClass("h-20");
    expect(activeUsersCard).not.toHaveClass("h-24");
    expect(
      screen.getByText("Messages / active user").closest(".bg-panel-background")
    ).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("gap-6");
    expect(screen.queryByText("Top agent")).not.toBeInTheDocument();
  });

  it("matches the agent card geometry while loading", () => {
    mockUseConsumptionOverview.mockReturnValue({
      overview: null,
      isOverviewLoading: true,
      isOverviewError: undefined,
    });

    const { container } = render(
      <ConsumptionSummary
        workspaceId="workspace-id"
        period={period}
        analyticsScope={agentAnalyticsScope}
      />
    );

    expect(container.firstElementChild).toHaveClass("gap-6");
    expect(container.querySelectorAll(".h-20.flex-1")).toHaveLength(4);
    expect(container.querySelectorAll(".h-24")).toHaveLength(0);
  });

  it("keeps the top agent in a workspace summary", () => {
    const { container } = render(
      <ConsumptionSummary workspaceId="workspace-id" period={period} />
    );

    expect(screen.getByText("Top agent")).toBeInTheDocument();
    expect(screen.getByText("Research agent")).toBeInTheDocument();
    expect(
      screen.getByText("Top agent").closest(".bg-panel-background")
    ).toHaveClass("h-24");
    expect(container.firstElementChild).toHaveClass("gap-4");
    expect(screen.queryByText("Active Users")).not.toBeInTheDocument();
    expect(screen.queryByText("Total cost")).not.toBeInTheDocument();
  });
});
