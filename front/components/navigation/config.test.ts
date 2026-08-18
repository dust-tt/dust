import { subNavigationAdmin } from "@app/components/navigation/config";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import type { PlanType, SubscriptionType } from "@app/types/plan";
import type { WorkspaceType } from "@app/types/user";
import { describe, expect, it } from "vitest";

const PLAN: PlanType = {
  code: "PRO_PLAN_SEAT_29",
  name: "Pro",
  limits: {
    assistant: {
      isSlackBotAllowed: true,
      maxMessages: -1,
      maxMessagesTimeframe: "lifetime",
      maxAwuCredits: -1,
      maxAwuCreditsTimeframe: "lifetime",
      isDeepDiveAllowed: true,
    },
    connections: {
      count: -1,
      isConfluenceAllowed: true,
      isSlackAllowed: true,
      isNotionAllowed: true,
      isGoogleDriveAllowed: true,
      isGithubAllowed: true,
      isIntercomAllowed: true,
      isWebCrawlerAllowed: true,
      isSalesforceAllowed: true,
    },
    dataSources: { count: -1, documents: { count: -1, sizeMb: -1 } },
    users: {
      maxUsers: -1,
      maxFreeUsers: -1,
      maxLifetimeFreeUsers: -1,
      isSSOAllowed: true,
      isSCIMAllowed: true,
    },
    vaults: { maxVaults: -1 },
    capabilities: { images: { maxImagesPerWeek: -1 } },
    canUseProduct: true,
  },
  trialPeriodDays: 0,
  isByok: false,
  isAuditLogsAllowed: true,
  hasAdvancedModelAccess: true,
};

const SUBSCRIPTION: SubscriptionType = {
  sId: "sub_test",
  status: "active",
  trialing: false,
  stripeSubscriptionId: "sub_stripe_test",
  metronomeContractId: null,
  startDate: null,
  endDate: null,
  paymentFailingSince: null,
  plan: PLAN,
  requestCancelAt: null,
};

function ownerWithRole(role: MembershipRoleType): WorkspaceType {
  return LightWorkspaceFactory.build({ role });
}

function automationNavItem(owner: WorkspaceType) {
  const nav = subNavigationAdmin({
    owner,
    currentRoute: "/w/ws_1/analytics/automations",
    featureFlags: ["enable_analytics_automations"],
    subscription: SUBSCRIPTION,
    hasPermission: () => false,
  });
  const section = nav.find((s) => s.id === "api");
  return section?.menus.find((menu) => menu.id === "analytics_automations");
}

describe("subNavigationAdmin automation entry", () => {
  it("is enabled for a manager", () => {
    const item = automationNavItem(ownerWithRole("manager"));
    expect(item?.disabled).toBe(false);
  });

  it("is enabled for an admin", () => {
    const item = automationNavItem(ownerWithRole("admin"));
    expect(item?.disabled).toBe(false);
  });

  it("is absent for a builder, who has no admin sidebar at all", () => {
    const item = automationNavItem(ownerWithRole("builder"));
    expect(item).toBeUndefined();
  });
});
