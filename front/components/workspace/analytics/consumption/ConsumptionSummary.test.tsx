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
  lastRecordAt: "2026-08-25T10:00:00.000Z",
  totalCredits: 100,
  topAgent: { agentId: "agent-1", name: "Research agent", credits: 100 },
  topUser: { userId: "user-1", name: "Aubin", credits: 60 },
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

  it("shows the top user in an agent-scoped summary", () => {
    render(
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
    expect(screen.getByText("Top user")).toBeInTheDocument();
    expect(screen.getByText("Aubin")).toBeInTheDocument();
    expect(screen.getByText("60% of total consumption")).toBeInTheDocument();
    expect(screen.queryByText("Top agent")).not.toBeInTheDocument();
  });

  it("keeps the top agent in a workspace summary", () => {
    render(<ConsumptionSummary workspaceId="workspace-id" period={period} />);

    expect(screen.getByText("Top agent")).toBeInTheDocument();
    expect(screen.getByText("Research agent")).toBeInTheDocument();
    expect(screen.queryByText("Top user")).not.toBeInTheDocument();
  });
});
