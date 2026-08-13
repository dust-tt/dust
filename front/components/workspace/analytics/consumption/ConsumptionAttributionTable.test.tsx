import { ConsumptionAttributionTable } from "@app/components/workspace/analytics/consumption/ConsumptionAttributionTable";
import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const { mockUseConsumptionTop } = vi.hoisted(() => ({
  mockUseConsumptionTop: vi.fn(),
}));

vi.mock("@app/hooks/useConsumptionTop", () => ({
  useConsumptionTop: mockUseConsumptionTop,
}));

vi.mock("@app/components/sparkle/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));

vi.mock("@dust-tt/sparkle", async (importOriginal) => {
  const sparkle = await importOriginal<typeof import("@dust-tt/sparkle")>();

  return {
    ...sparkle,
    Tooltip: ({ label, trigger }: { label: ReactNode; trigger: ReactNode }) => (
      <>
        {trigger}
        <div role="tooltip">{label}</div>
      </>
    ),
  };
});

vi.mock(
  "@app/components/workspace/analytics/consumption/ConsumptionAttributionBreakdown",
  () => ({
    ConsumptionAttributionBreakdown: () => <div>Attribution breakdown</div>,
  })
);

const period = { kind: "days", days: 30 } as const;

describe("ConsumptionAttributionTable", () => {
  it("keeps the selected page after pagination renders new rows", async () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({
      id: `agent-${index + 1}`,
      name: `Agent ${index + 1}`,
      pictureUrl: null,
      credits: 100 - index,
      avgCredits: 10,
    }));
    mockUseConsumptionTop.mockReturnValue({
      rows,
      totalCredits: 2_565,
      isTopLoading: false,
      isTopError: undefined,
    });

    render(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        dimension="agent"
        onDimensionChange={vi.fn()}
        onAddFilter={vi.fn()}
        onViewAll={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "2" }));

    await waitFor(() => {
      expect(screen.getByText("Showing 26-30 of 30 items")).toBeInTheDocument();
    });
    expect(screen.getByText("Agent 30")).toBeInTheDocument();
  });

  it("resets expanded rows when switching dimensions", () => {
    mockUseConsumptionTop.mockImplementation(
      ({ dimension }: { dimension: ConsumptionDimension }) => ({
        rows: [
          {
            id: "shared-row-id",
            name: dimension === "agent" ? "Research agent" : "Large model",
            pictureUrl: null,
            description: null,
            icon: null,
            modelId: null,
            modelDisplayName: null,
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
    expect(
      screen.getByRole("button", {
        name: "Collapse breakdown for Research agent",
      })
    ).toHaveAttribute("aria-expanded", "true");
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

  it("renders the skill identity and description without a model", () => {
    mockUseConsumptionTop.mockReturnValue({
      rows: [
        {
          id: "skill-id",
          name: "Research",
          pictureUrl: null,
          description: "Researches a topic in depth.",
          icon: "search",
          modelId: null,
          modelDisplayName: null,
          credits: 100,
          avgCredits: 10,
        },
      ],
      totalCredits: 100,
      isTopLoading: false,
      isTopError: undefined,
    });

    render(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        dimension="skill"
        onDimensionChange={vi.fn()}
        onAddFilter={vi.fn()}
        onViewAll={vi.fn()}
      />
    );

    const tooltip = screen.getByRole("tooltip");
    expect(within(tooltip).getByText("Research")).toBeInTheDocument();
    expect(
      within(tooltip).getByText("Researches a topic in depth.")
    ).toBeInTheDocument();
    expect(tooltip.querySelector("svg")).toBeInTheDocument();
  });
});
