import {
  getAdminSectionHref,
  subNavigationAdmin,
} from "@app/components/navigation/config";
import { i18n } from "@app/lib/i18n/i18n";
import { LightSubscriptionFactory } from "@app/tests/utils/LightSubscriptionFactory";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import type { WorkspaceType } from "@app/types/user";
import type { MessageDescriptor } from "@lingui/core";
import { describe, expect, it } from "vitest";

const SUBSCRIPTION = LightSubscriptionFactory.build();

const translate = (descriptor: MessageDescriptor) => i18n._(descriptor);

function ownerWithRole(role: MembershipRoleType): WorkspaceType {
  return LightWorkspaceFactory.build({ role });
}

function platformNavItem(owner: WorkspaceType, id: string) {
  const nav = subNavigationAdmin({
    owner,
    currentRoute: "/w/ws_1/automations",
    featureFlags: [],
    subscription: SUBSCRIPTION,
    hasPermission: () => false,
    t: translate,
  });
  const section = nav.find((s) => s.id === "platform");
  return section?.menus.find((menu) => menu.id === id);
}

function spendNavItems(owner: WorkspaceType, currentRoute: string) {
  const nav = subNavigationAdmin({
    owner,
    currentRoute,
    featureFlags: [],
    subscription: SUBSCRIPTION,
    hasPermission: () => false,
    t: translate,
  });

  return nav.find((section) => section.id === "spend")?.menus ?? [];
}

describe("subNavigationAdmin automation entry", () => {
  it("is enabled for a manager", () => {
    const item = platformNavItem(ownerWithRole("manager"), "automations");
    expect(item?.disabled).toBe(false);
  });

  it("is enabled for an admin", () => {
    const item = platformNavItem(ownerWithRole("admin"), "automations");
    expect(item?.disabled).toBe(false);
  });

  it("is absent for a regular user, who has no admin sidebar at all", () => {
    const item = platformNavItem(ownerWithRole("user"), "automations");
    expect(item).toBeUndefined();
  });
});

describe("subNavigationAdmin analytics entry", () => {
  it("links to consumption analytics without a feature flag", () => {
    const items = spendNavItems(
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
    const items = spendNavItems(ownerWithRole("manager"), "/w/ws_1/analytics");

    expect(items).not.toContainEqual(
      expect.objectContaining({ href: expect.stringMatching(/\/analytics$/) })
    );
    expect(items.find((item) => item.id === "analytics")?.current).toBe(false);
  });
});

describe("subNavigationAdmin Organization / Spend / Platform groups", () => {
  it("exposes the three IA groups in order", () => {
    const nav = subNavigationAdmin({
      owner: ownerWithRole("admin"),
      currentRoute: "/w/ws_1/members",
      featureFlags: [],
      subscription: SUBSCRIPTION,
      hasPermission: () => true,
      t: translate,
    });

    expect(nav.map((section) => section.id)).toEqual([
      "organization",
      "spend",
      "platform",
    ]);
    expect(nav.map((section) => section.label)).toEqual([
      "Organization",
      "Spend",
      "Platform",
    ]);
  });

  it("shows Members and Credits but keeps Governance disabled for a group manager", () => {
    const nav = subNavigationAdmin({
      owner: ownerWithRole("user"),
      currentRoute: "/w/ws_1/credits",
      featureFlags: [],
      subscription: SUBSCRIPTION,
      hasPermission: () => false,
      hasManagedGroups: true,
      t: translate,
    });
    const organization = nav.find(
      (section) => section.id === "organization"
    )?.menus;
    const spend = nav.find((section) => section.id === "spend")?.menus;

    expect(spend?.find((item) => item.id === "credits")?.disabled).toBe(false);
    expect(organization?.find((item) => item.id === "members")?.disabled).toBe(
      false
    );
    expect(
      organization?.find((item) => item.id === "governance")?.disabled
    ).toBe(true);
  });
});

it("links group managers to Credits from the Admin tab", () => {
  const owner = ownerWithRole("user");
  const hasPermission = () => false;

  expect(getAdminSectionHref(owner, hasPermission, false)).toBeNull();
  expect(getAdminSectionHref(owner, hasPermission, true)).toBe(
    `/w/${owner.sId}/credits`
  );
});
