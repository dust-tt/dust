import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("ChartTooltipCard", () => {
  it("renders the same light separator between rows and before the footer", () => {
    render(
      <ChartTooltipCard
        rows={[
          { key: "active-users", label: "Active users", value: 3 },
          { key: "credits", label: "Credits", value: 10 },
        ]}
        footer="10 credits total"
        separatorAfterKey="active-users"
      />
    );

    const creditsRow = screen.getByText("Credits").closest("li");
    const footer = screen.getByText("10 credits total");
    const activeUsersValue = screen.getByText("3");

    expect(activeUsersValue).toHaveClass("tabular-nums");
    expect(activeUsersValue).not.toHaveClass("font-mono");
    expect(creditsRow?.parentElement).toHaveClass("space-y-1.5");
    expect(creditsRow).toHaveClass("border-t", "border-border/50", "pt-1");
    expect(footer).toHaveClass("mt-1", "border-t", "border-border/50", "pt-1");
  });
});
