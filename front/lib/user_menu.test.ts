import {
  getUserMenuModalRoute,
  getUserMenuModalShareRoute,
  isUserMenuModal,
} from "@app/lib/user_menu";
import { describe, expect, it } from "vitest";

describe("user menu links", () => {
  it.each([
    ["personal-usage", "/w/workspace-id/conversation/new?modal=personal-usage"],
    [
      "personal-automations",
      "/w/workspace-id/conversation/new?modal=personal-automations",
    ],
  ] as const)("builds the %s modal route", (modal, expectedRoute) => {
    expect(getUserMenuModalRoute("workspace-id", modal)).toBe(expectedRoute);
  });

  it("only accepts supported modal values", () => {
    expect(isUserMenuModal("personal-usage")).toBe(true);
    expect(isUserMenuModal("personal-automations")).toBe(true);
    expect(isUserMenuModal("apps")).toBe(false);
    expect(isUserMenuModal(["personal-usage"])).toBe(false);
  });

  it.each([
    ["personal-usage", "/?goto=personal-usage"],
    ["personal-automations", "/?goto=personal-automations"],
  ] as const)("builds the shareable %s route", (modal, expectedRoute) => {
    expect(getUserMenuModalShareRoute(modal)).toBe(expectedRoute);
  });
});
