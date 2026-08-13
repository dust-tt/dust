import { ConsumptionAttributionTable } from "@app/components/workspace/analytics/consumption/ConsumptionAttributionTable";
import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { mockUseConsumptionTop } = vi.hoisted(() => ({
  mockUseConsumptionTop: vi.fn(),
}));

vi.mock("@app/hooks/useConsumptionTop", () => ({
  useConsumptionTop: mockUseConsumptionTop,
}));

vi.mock(
  "@app/components/workspace/analytics/consumption/ConsumptionAttributionBreakdown",
  () => ({
    ConsumptionAttributionBreakdown: () => <div>Attribution breakdown</div>,
  })
);

const period = { kind: "days", days: 30 } as const;

describe("ConsumptionAttributionTable", () => {
  it("resets expanded rows when switching dimensions", () => {
    mockUseConsumptionTop.mockImplementation(
      ({ dimension }: { dimension: ConsumptionDimension }) => ({
        rows: [
          {
            id: "shared-row-id",
            name: dimension === "agent" ? "Research agent" : "Large model",
            pictureUrl: null,
            credits: 100,
            avgCredits: 10,
          },
        ],
        totalCredits: 100,
        isTopLoading: false,
        isTopError: undefined,
      })
    );

    const { rerender } = render(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        dimension="agent"
        onDimensionChange={vi.fn()}
        onAddFilter={vi.fn()}
        onViewAll={vi.fn()}
      />
    );

    const expandAgent = screen.getByRole("button", {
      name: "Expand breakdown for Research agent",
    });
    fireEvent.click(expandAgent);
    expect(expandAgent).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Attribution breakdown")).toBeInTheDocument();

    rerender(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        dimension="model"
        onDimensionChange={vi.fn()}
        onAddFilter={vi.fn()}
        onViewAll={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", {
        name: "Expand breakdown for Large model",
      })
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Attribution breakdown")).not.toBeInTheDocument();
  });
});
