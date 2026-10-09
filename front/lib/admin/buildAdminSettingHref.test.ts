import {
  buildAdminSettingHref,
  navigateToAdminSetting,
} from "@app/lib/admin/buildAdminSettingHref";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("buildAdminSettingHref", () => {
  it("appends the section hash", () => {
    expect(
      buildAdminSettingHref("/w/ws/governance", { sectionId: "pods" })
    ).toBe("/w/ws/governance#pods");
    expect(
      buildAdminSettingHref("/w/ws/governance?foo=1", { sectionId: "pods" })
    ).toBe("/w/ws/governance?foo=1#pods");
  });

  it("sets tab when present", () => {
    expect(
      buildAdminSettingHref("/w/ws/usage", {
        sectionId: "features",
        tab: "settings",
      })
    ).toBe("/w/ws/usage?tab=settings#features");
  });

  it("replaces existing query params with the tab", () => {
    expect(
      buildAdminSettingHref("/w/ws/members?foo=1", {
        sectionId: "roles",
        tab: "groups",
      })
    ).toBe("/w/ws/members?tab=groups#roles");
  });
});

describe("navigateToAdminSetting", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, "", "/");
  });

  it("toggles hash on fully same-page jumps so hashchange fires", () => {
    window.history.pushState(
      {},
      "",
      "/w/ws/credits?tab=settings#usage-programmatic"
    );
    const push = vi.fn();
    navigateToAdminSetting(push, "/w/ws/credits", {
      sectionId: "usage-programmatic",
      tab: "settings",
    });
    expect(push).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#usage-programmatic");
  });

  it("re-asserts hash after same-pathname tab changes", () => {
    vi.useFakeTimers();
    window.history.pushState({}, "", "/w/ws/credits#usage-add-credits");
    const push = vi.fn((href: string) => {
      window.history.pushState({}, "", href);
    });
    navigateToAdminSetting(push, "/w/ws/credits", {
      sectionId: "usage-programmatic",
      tab: "settings",
    });
    expect(push).toHaveBeenCalledWith(
      "/w/ws/credits?tab=settings#usage-programmatic"
    );
    vi.runAllTimers();
    expect(window.location.hash).toBe("#usage-programmatic");
    vi.useRealTimers();
  });
});
