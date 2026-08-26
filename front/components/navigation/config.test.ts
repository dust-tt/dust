import { subNavigationAdmin } from "@app/components/navigation/config";
import { LightSubscriptionFactory } from "@app/tests/utils/LightSubscriptionFactory";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import type { WorkspaceType } from "@app/types/user";
import { describe, expect, it } from "vitest";

const SUBSCRIPTION = LightSubscriptionFactory.build();

function ownerWithRole(role: MembershipRoleType): WorkspaceType {
  return LightWorkspaceFactory.build({ role });
}

function automationNavItem(owner: WorkspaceType) {
  const nav = subNavigationAdmin({
    owner,
    currentRoute: "/w/ws_1/automations",
    featureFlags: [],
    subscription: SUBSCRIPTION,
    hasPermission: () => false,
  });
  const section = nav.find((s) => s.id === "api");
  return section?.menus.find((menu) => menu.id === "automations");
}

function workspaceNavItems(owner: WorkspaceType, currentRoute: string) {
  const nav = subNavigationAdmin({
    owner,
    currentRoute,
    featureFlags: [],
    subscription: SUBSCRIPTION,
    hasPermission: () => false,
  });

  return nav.find((section) => section.id === "workspace")?.menus ?? [];
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

describe("subNavigationAdmin analytics entry", () => {
  it("links to consumption analytics without a feature flag", () => {
    const items = workspaceNavItems(
      ownerWithRole("manager"),
      "/w/ws_1/analytics/consumption"
    );
    const analyticsItems = items.filter((item) => item.label === "Analytics");

    expect(analyticsItems).toHaveLength(1);
    expect(analyticsItems[0]).toMatchObject({
      current: true,
      href: expect.stringMatching(/\/analytics\/consumption$/),
      id: "analytics",
    });
  });

  it("keeps the legacy analytics route out of the sidebar", () => {
    const items = workspaceNavItems(
      ownerWithRole("manager"),
      "/w/ws_1/analytics"
    );

    expect(items).not.toContainEqual(
      expect.objectContaining({ href: expect.stringMatching(/\/analytics$/) })
    );
    expect(items.find((item) => item.id === "analytics")?.current).toBe(false);
  });
});
