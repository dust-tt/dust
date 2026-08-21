import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CreditUsageState } from "./CreditUsage";
import { CreditUsage } from "./CreditUsage";

const ON_TARGET_STATE = {
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
});
