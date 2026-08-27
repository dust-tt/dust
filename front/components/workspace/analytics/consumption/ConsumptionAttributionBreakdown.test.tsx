import type { ConsumptionAttributionBreakdownColumnProps } from "@app/components/workspace/analytics/consumption/ConsumptionAttributionBreakdown";
import {
  ConsumptionAttributionBreakdownColumnView,
  ConsumptionAttributionBreakdownView,
} from "@app/components/workspace/analytics/consumption/ConsumptionAttributionBreakdown";
import type { ConsumptionTopRow } from "@app/hooks/useConsumptionTop";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const SELECTED_MODEL: ConsumptionTopRow = {
  id: "claude-sonnet-4-6",
  name: "Claude Sonnet 4.6",
  pictureUrl: null,
  description: null,
  icon: null,
  modelId: null,
  modelDisplayName: null,
  credits: 100,
  avgCredits: 10,
  previousCredits: null,
};

const period = { kind: "days", days: 30 } as const;

describe("ConsumptionAttributionBreakdown", () => {
  it("adds reasoning effort first in a model breakdown without a view-all action", () => {
    function BreakdownColumn({
      dimension,
      filter,
      onViewAll,
    }: ConsumptionAttributionBreakdownColumnProps) {
      return (
        <div data-testid="breakdown-column">
          {dimension}:{filter.models?.join(",")}:
          {onViewAll ? "view-all" : "no-view-all"}
        </div>
      );
    }

    render(
      <ConsumptionAttributionBreakdownView
        workspaceId="workspace-id"
        selectedDimension="model"
        selectedRow={SELECTED_MODEL}
        period={period}
        onViewAll={vi.fn()}
        BreakdownColumnComponent={BreakdownColumn}
      />
    );

    expect(
      screen
        .getAllByTestId("breakdown-column")
        .map((element) => element.textContent)
    ).toEqual([
      "reasoning_effort:claude-sonnet-4-6:no-view-all",
      "tool:claude-sonnet-4-6:view-all",
      "user:claude-sonnet-4-6:view-all",
    ]);
  });

  it("does not add reasoning effort to other attribution breakdowns", () => {
    function BreakdownColumn({
      dimension,
    }: ConsumptionAttributionBreakdownColumnProps) {
      return <div>{dimension}</div>;
    }

    render(
      <ConsumptionAttributionBreakdownView
        workspaceId="workspace-id"
        selectedDimension="agent"
        selectedRow={{ ...SELECTED_MODEL, id: "agent-id", name: "Dust" }}
        period={period}
        onViewAll={vi.fn()}
        BreakdownColumnComponent={BreakdownColumn}
      />
    );

    expect(screen.queryByText("reasoning_effort")).not.toBeInTheDocument();
  });

  it("renders the provided view-all action for reasoning effort", () => {
    render(
      <ConsumptionAttributionBreakdownColumnView
        dimension="reasoning_effort"
        selectedRowName="Claude Sonnet 4.6"
        onViewAll={vi.fn()}
        rows={[{ ...SELECTED_MODEL, id: "high", name: "High", credits: 60 }]}
        totalCredits={100}
        isTopLoading={false}
        isTopError={false}
      />
    );

    expect(screen.getByText("By reasoning effort")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "View all reasoning effort for Claude Sonnet 4.6",
      })
    ).toBeInTheDocument();
  });
});
