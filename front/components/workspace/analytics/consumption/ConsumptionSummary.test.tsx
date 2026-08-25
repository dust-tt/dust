import { ConsumptionSummary } from "@app/components/workspace/analytics/consumption/ConsumptionSummary";
import type { GetConsumptionOverviewResponse } from "@app/lib/api/analytics/consumption/overview";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseConsumptionOverview, mockUseConsumptionTop } = vi.hoisted(
  () => ({
    mockUseConsumptionOverview: vi.fn(),
    mockUseConsumptionTop: vi.fn(),
  })
);

vi.mock("@app/hooks/useConsumptionOverview", () => ({
  useConsumptionOverview: mockUseConsumptionOverview,
}));

vi.mock("@app/hooks/useConsumptionTop", () => ({
  useConsumptionTop: mockUseConsumptionTop,
}));

const period = { kind: "days", days: 30 } as const;

const overview: GetConsumptionOverviewResponse = {
  period: {
    startDate: "2026-08-01T00:00:00.000Z",
    endDate: "2026-08-31T23:59:59.999Z",
  },
  members: { active: 2, total: 2 },
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
    mockUseConsumptionTop.mockReturnValue({
      rows: [
        {
          id: "user-1",
          name: "Aubin",
          pictureUrl: null,
          description: null,
          icon: null,
          modelId: null,
          modelDisplayName: null,
          credits: 60,
          avgCredits: 30,
          previousCredits: null,
        },
      ],
      totalCredits: 100,
      totalCount: 1,
      hasMore: false,
      isTopLoading: false,
      isTopError: undefined,
      isTopValidating: false,
    });
  });

  it("shows the top user in an agent-scoped summary", () => {
    render(
      <ConsumptionSummary
        workspaceId="workspace-id"
        period={period}
        agentId="agent-1"
      />
    );

    expect(mockUseConsumptionTop).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-id",
        dimension: "user",
        limit: 1,
        agentId: "agent-1",
      })
    );
    expect(screen.getByText("Top user")).toBeInTheDocument();
    expect(screen.getByText("Aubin")).toBeInTheDocument();
    expect(screen.getByText("60% of total consumption")).toBeInTheDocument();
    expect(screen.queryByText("Top agent")).not.toBeInTheDocument();
  });

  it("keeps the top agent in a workspace summary", () => {
    render(<ConsumptionSummary workspaceId="workspace-id" period={period} />);

    expect(mockUseConsumptionTop).toHaveBeenCalledWith(
      expect.objectContaining({ disabled: true })
    );
    expect(screen.getByText("Top agent")).toBeInTheDocument();
    expect(screen.getByText("Research agent")).toBeInTheDocument();
    expect(screen.queryByText("Top user")).not.toBeInTheDocument();
  });
});
