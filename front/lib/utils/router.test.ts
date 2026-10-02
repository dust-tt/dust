import { getPodRoute, navigateToPod } from "@app/lib/utils/router";
import { describe, expect, it, vi } from "vitest";

describe("getPodRoute", () => {
  it("builds the pod path", () => {
    expect(getPodRoute("w1", "pod_1")).toBe("/w/w1/pods/pod_1");
  });

  it("appends tab hash and query params", () => {
    expect(getPodRoute("w1", "pod_1", "conversations", "agent=a1")).toBe(
      "/w/w1/pods/pod_1?agent=a1#conversations"
    );
  });
});

describe("navigateToPod", () => {
  it("pushes when navigating to a different pod", () => {
    window.history.replaceState(null, "", "/w/w1/pods/pod_other#tasks");
    const push = vi.fn();

    navigateToPod(push, "w1", "pod_1", "conversations");

    expect(push).toHaveBeenCalledWith("/w/w1/pods/pod_1#conversations");
    expect(window.location.hash).toBe("#tasks");
  });

  it("sets location.hash on the same pod so hashchange fires", () => {
    window.history.replaceState(null, "", "/w/w1/pods/pod_1#tasks");
    const push = vi.fn();

    navigateToPod(push, "w1", "pod_1", "conversations");

    expect(push).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/w/w1/pods/pod_1");
    expect(window.location.hash).toBe("#conversations");
  });

  it("clears then sets hash when already on the target tab", () => {
    window.history.replaceState(null, "", "/w/w1/pods/pod_1#conversations");
    const push = vi.fn();

    navigateToPod(push, "w1", "pod_1", "conversations");

    expect(push).not.toHaveBeenCalled();
    // Final hash is still the target tab. Clear-then-set is what forces a
    // hashchange in the browser when preferences are out of sync with the URL.
    expect(window.location.hash).toBe("#conversations");
  });

  it("pushes then sets hash when search params change on the same pod", () => {
    window.history.replaceState(null, "", "/w/w1/pods/pod_1#tasks");
    const push = vi.fn((href: string) => {
      const url = new URL(href, window.location.origin);
      window.history.pushState(null, "", url.pathname + url.search + url.hash);
    });

    navigateToPod(push, "w1", "pod_1", "conversations", "agent=a1");

    expect(push).toHaveBeenCalledWith(
      "/w/w1/pods/pod_1?agent=a1#conversations"
    );
    expect(window.location.search).toBe("?agent=a1");
    expect(window.location.hash).toBe("#conversations");
  });
});
