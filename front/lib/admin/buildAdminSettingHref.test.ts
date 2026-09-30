import { buildAdminSettingHref } from "@app/lib/admin/buildAdminSettingHref";
import { describe, expect, it } from "vitest";

describe("buildAdminSettingHref", () => {
  it("appends the section hash", () => {
    expect(
      buildAdminSettingHref("/w/ws/governance", { sectionId: "pods" })
    ).toBe("/w/ws/governance#pods");
  });

  it("sets tab when present", () => {
    expect(
      buildAdminSettingHref("/w/ws/usage", {
        sectionId: "features",
        tab: "settings",
      })
    ).toBe("/w/ws/usage?tab=settings#features");
  });

  it("preserves existing query params", () => {
    expect(
      buildAdminSettingHref("/w/ws/members?foo=1", {
        sectionId: "roles",
        tab: "groups",
      })
    ).toBe("/w/ws/members?foo=1&tab=groups#roles");
  });
});
