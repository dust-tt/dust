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
  it("caps the available pages and fetches the selected fixed-size page", async () => {
    const rows = Array.from({ length: 1_025 }, (_, index) => ({
      id: `agent-${index + 1}`,
      name: `Agent ${index + 1}`,
      pictureUrl: null,
      credits: 100 - index,
      avgCredits: 10,
    }));
    mockUseConsumptionTop.mockImplementation(
      ({ limit, offset }: { limit: number; offset: number }) => ({
        rows: rows.slice(offset, offset + limit),
        totalCredits: 2_565,
        totalCount: rows.length,
        hasMore: offset + limit < rows.length,
        isTopLoading: false,
        isTopError: undefined,
        isTopValidating: false,
      })
    );

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

    expect(mockUseConsumptionTop).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25, offset: 0 })
    );

    expect(screen.getByRole("button", { name: "40" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "41" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "40" }));

    await waitFor(() => {
      expect(mockUseConsumptionTop).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 25, offset: 975 })
      );
      expect(screen.getByText("Agent 1000")).toBeInTheDocument();
    });
  });

  it("sends the search to the backend", async () => {
    mockUseConsumptionTop.mockReturnValue({
      rows: [],
      totalCredits: 0,
      totalCount: 0,
      hasMore: false,
      isTopLoading: false,
      isTopError: undefined,
      isTopValidating: false,
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

    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "Agent 080" },
    });

    await waitFor(() => {
      expect(mockUseConsumptionTop).toHaveBeenCalledWith(
        expect.objectContaining({ search: "Agent 080", offset: 0, limit: 25 })
      );
    });
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
        totalCount: 1,
        hasMore: false,
        isTopLoading: false,
        isTopError: undefined,
        isTopValidating: false,
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
