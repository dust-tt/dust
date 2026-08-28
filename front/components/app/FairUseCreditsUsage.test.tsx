import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FairUseCreditsUsage } from "./FairUseCreditsUsage";

const { mockUseFairUseCredits } = vi.hoisted(() => ({
  mockUseFairUseCredits: vi.fn(),
}));

vi.mock("@app/components/FairUsageModal", () => ({
  FairUsageModal: () => null,
}));

vi.mock("@app/lib/swr/fair_use_credits", () => ({
  useFairUseCredits: mockUseFairUseCredits,
}));

describe("FairUseCreditsUsage", () => {
  beforeEach(() => {
    mockUseFairUseCredits.mockReturnValue({
      fairUseAwuCreditsState: {
        count: 2_000,
        limit: 20_000,
        timeframe: "week",
      },
      mutateFairUseCredits: vi.fn(),
    });
  });

  it("shows rolling weekly usage below the warning threshold", () => {
    render(<FairUseCreditsUsage workspaceId="w_123" />);

    expect(screen.getByText("Fair usage")).toBeInTheDocument();
    expect(
      screen.getByText(/2,000 \/ 20,000 credits over the past 7 days/)
    ).toBeInTheDocument();
    expect(screen.getByText("Fair Use policy")).toBeInTheDocument();
    expect(screen.getByText("10%")).toHaveClass("text-highlight-500");
    expect(
      screen.getByRole("progressbar", { name: "Fair usage used" })
    ).toHaveAttribute("aria-valuenow", "10");
  });

  it("stays hidden when the plan has unlimited fair-use credits", () => {
    mockUseFairUseCredits.mockReturnValue({
      fairUseAwuCreditsState: {
        count: 0,
        limit: -1,
        timeframe: "lifetime",
      },
      mutateFairUseCredits: vi.fn(),
    });

    render(<FairUseCreditsUsage workspaceId="w_123" />);

    expect(screen.queryByText("Fair usage")).not.toBeInTheDocument();
  });
});
