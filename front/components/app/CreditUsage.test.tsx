import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CreditUsageState } from "./CreditUsage";
import {
  CREDIT_USAGE_LEARN_MORE_LABEL,
  CreditUsage,
  CreditUsageLearnMoreButton,
} from "./CreditUsage";

const ON_TARGET_STATE = {
  kind: "billing_period",
  usedPercentage: 80,
  resetInDays: 5,
  target: "on_target",
} satisfies CreditUsageState;

describe("CreditUsage", () => {
  it("renders the compact profile menu presentation", () => {
    render(<CreditUsage state={ON_TARGET_STATE} variant="profile_menu" />);

    expect(screen.getByText("Credits")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("80%")).toHaveClass("text-highlight-500");
    expect(screen.getByText("Reset in 5 days")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Credits used" })
    ).toHaveAttribute("aria-valuenow", "80");
  });

  it("renders the profile menu learn more action", () => {
    const onLearnMore = vi.fn();

    render(
      <CreditUsage
        state={ON_TARGET_STATE}
        variant="profile_menu"
        onLearnMore={onLearnMore}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: CREDIT_USAGE_LEARN_MORE_LABEL })
    );

    expect(onLearnMore).toHaveBeenCalledOnce();
  });

  it("renders the standalone learn more action", () => {
    const onLearnMore = vi.fn();

    render(<CreditUsageLearnMoreButton onClick={onLearnMore} />);

    const button = screen.getByRole("button", {
      name: CREDIT_USAGE_LEARN_MORE_LABEL,
    });
    fireEvent.click(button);

    expect(onLearnMore).toHaveBeenCalledOnce();
  });

  it("renders the companion presentation and clamps displayed usage", () => {
    const rendered = render(
      <CreditUsage
        state={{
          ...ON_TARGET_STATE,
          usedPercentage: 120,
          resetInDays: 1,
          target: "critical",
        }}
        variant="companion"
      />
    );

    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(
      screen.getByText("Usage is well above target · Credit reset in 1 day")
    ).toBeInTheDocument();
    const progressbar = rendered.getByRole("progressbar", {
      name: "Credits used",
    });
    expect(progressbar.firstElementChild).toHaveStyle({ flexGrow: "100" });
    expect(progressbar.firstElementChild).toHaveClass("bg-red-500");
  });

  it("uses the warning treatment for elevated usage", () => {
    render(
      <CreditUsage
        state={{ ...ON_TARGET_STATE, target: "elevated" }}
        variant="companion"
      />
    );

    expect(screen.getByText("80%")).toHaveClass("text-warning-500");
    expect(
      screen.getByRole("progressbar", { name: "Credits used" })
        .firstElementChild
    ).toHaveClass("bg-warning-500");
  });

  it("renders rolling-window consumption", () => {
    render(
      <CreditUsage
        state={{
          kind: "rolling_window",
          usedCredits: 2_000,
          limitCredits: 20_000,
          timeframe: "week",
          usedPercentage: 10,
        }}
        variant="profile_menu"
      />
    );

    expect(
      screen.getByText("2,000 of 20,000 used in the last 7 days")
    ).toBeInTheDocument();
  });
});
