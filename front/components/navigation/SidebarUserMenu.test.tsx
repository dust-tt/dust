import type { CreditUsageState } from "@app/components/app/CreditUsage";
import { SidebarUserMenu } from "@app/components/navigation/SidebarUserMenu";
import { CREDIT_PRICED_BUSINESS_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { LightPlanFactory } from "@app/tests/utils/LightPlanFactory";
import { LightSubscriptionFactory } from "@app/tests/utils/LightSubscriptionFactory";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import type { UserTypeWithWorkspaces } from "@app/types/user";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useFairUseCredits: vi.fn(),
  useMyUsage: vi.fn(),
}));

interface UserMenuMockProps {
  creditUsageState?: CreditUsageState | null;
}

vi.mock("@app/components/app/FairUseCreditsUsage", () => ({
  FairUseCreditsUsage: () => null,
}));

vi.mock("@app/components/UserMenu", async () => {
  const { CreditUsage } = await import("@app/components/app/CreditUsage");

  return {
    UserMenu: ({ creditUsageState }: UserMenuMockProps) =>
      creditUsageState ? (
        <CreditUsage state={creditUsageState} variant="profile_menu" />
      ) : null,
  };
});

vi.mock("@app/lib/swr/credits", () => ({
  useMyUsage: mocks.useMyUsage,
}));

vi.mock("@app/lib/swr/fair_use_credits", () => ({
  useFairUseCredits: mocks.useFairUseCredits,
}));

const owner = LightWorkspaceFactory.build();
const user = {
  sId: "user_1",
  id: 1,
  createdAt: 0,
  provider: "google",
  username: "free-seat-user",
  email: "free-seat-user@example.com",
  firstName: "Free",
  lastName: "Seat",
  fullName: "Free Seat",
  image: null,
  lastLoginAt: null,
  workspaces: [owner],
  seatType: "free",
} satisfies UserTypeWithWorkspaces;
const subscription = LightSubscriptionFactory.build({
  stripeSubscriptionId: null,
  metronomeContractId: "contract_1",
  plan: LightPlanFactory.build({ code: CREDIT_PRICED_BUSINESS_PLAN_CODE }),
});

describe("SidebarUserMenu", () => {
  beforeEach(() => {
    mocks.useFairUseCredits.mockReturnValue({
      fairUseAwuCreditsState: null,
    });
  });

  it("shows Free seat usage as lifetime credits", () => {
    mocks.useMyUsage.mockReturnValue({
      myUsage: {
        seatType: "free",
        memberUsageLimit: 500,
        seatBalanceAwu: 325,
      },
      creditUsageStatus: {
        usedPercentage: 12,
        resetAt: "2026-09-30T00:00:00.000Z",
        target: "on_target",
      },
    });

    render(
      <SidebarUserMenu user={user} owner={owner} subscription={subscription} />
    );

    expect(
      screen.getByText("175 of 500 used on your current plan")
    ).toBeInTheDocument();
    expect(screen.queryByText(/reset/i)).toBeNull();
  });

  it("does not claim a reset when the lifetime balance is unavailable", () => {
    mocks.useMyUsage.mockReturnValue({
      myUsage: {
        seatType: "free",
        memberUsageLimit: 500,
        seatBalanceAwu: null,
      },
      creditUsageStatus: {
        usedPercentage: 12,
        resetAt: "2026-09-30T00:00:00.000Z",
        target: "on_target",
      },
    });

    render(
      <SidebarUserMenu user={user} owner={owner} subscription={subscription} />
    );

    expect(screen.queryByText(/reset/i)).toBeNull();
    expect(screen.queryByText("Credits")).toBeNull();
  });
});
