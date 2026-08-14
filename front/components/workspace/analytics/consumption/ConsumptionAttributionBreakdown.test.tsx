import { ConsumptionAttributionBreakdown } from "@app/components/workspace/analytics/consumption/ConsumptionAttributionBreakdown";
import type { ConsumptionTopRow } from "@app/hooks/useConsumptionTop";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { mockUseConsumptionTop } = vi.hoisted(() => ({
  mockUseConsumptionTop: vi.fn(),
}));

vi.mock("@app/hooks/useConsumptionTop", () => ({
  useConsumptionTop: mockUseConsumptionTop,
}));

const period = { kind: "days", days: 30 } as const;

const selectedRow: ConsumptionTopRow = {
  id: "agent-1",
  name: "Research agent",
  pictureUrl: null,
  description: null,
  icon: null,
  modelId: null,
  modelDisplayName: null,
  credits: 100,
  avgCredits: 10,
};

describe("ConsumptionAttributionBreakdown", () => {
  it("includes API keys in the cross-attribution breakdown", () => {
    mockUseConsumptionTop.mockReturnValue({
      rows: [],
      totalCredits: 0,
      isTopLoading: false,
      isTopError: undefined,
    });

    render(
      <ConsumptionAttributionBreakdown
        workspaceId="workspace-id"
        selectedDimension="agent"
        selectedRow={selectedRow}
        period={period}
        filter={{ tools: ["existing-tool"] }}
        onViewAll={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "By API key" })).toBeVisible();
    expect(mockUseConsumptionTop).toHaveBeenCalledWith(
      expect.objectContaining({
        dimension: "api_key",
        filter: {
          agents: [selectedRow.id],
          tools: ["existing-tool"],
        },
      })
    );
  });
});
