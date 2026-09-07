import { useUserMenuModal } from "@app/hooks/useUserMenuModal";
import { useAppRouter } from "@app/lib/platform";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/platform", () => ({
  useAppRouter: vi.fn(),
}));

describe("useUserMenuModal", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/w/workspace-id/conversation/new");
    vi.mocked(useAppRouter).mockReturnValue({
      isReady: true,
      pathname: window.location.pathname,
      asPath: window.location.pathname,
      query: {},
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      reload: vi.fn(),
      events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    });
  });

  it.each([
    "personal-usage",
    "personal-automations",
    "personal-settings",
    "personal-tools",
  ] as const)("opens %s from its hash and preserves unrelated URL state when closing", (modal) => {
    const baseUrl =
      "/w/workspace-id/conversation/new?foo=bar#content?view=list";
    window.history.replaceState(null, "", `${baseUrl}&modal=${modal}`);

    const { result } = renderHook(() => useUserMenuModal());
    expect(result.current[0]).toBe(modal);

    act(() => result.current[1](undefined));
    expect(result.current[0]).toBeUndefined();
    expect(window.location.href).toBe(`${window.location.origin}${baseUrl}`);
  });

  it("updates the hash on selection and follows hash changes and browser history", async () => {
    const { result } = renderHook(() => useUserMenuModal());

    act(() => result.current[1]("personal-settings"));
    expect(window.location.hash).toBe("#?modal=personal-settings");

    act(() => {
      window.location.hash = "?modal=personal-tools";
    });
    await waitFor(() => expect(result.current[0]).toBe("personal-tools"));

    act(() => {
      window.history.replaceState(null, "", "#?modal=personal-settings");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current[0]).toBe("personal-settings");

    act(() => {
      window.history.replaceState(null, "", window.location.pathname);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current[0]).toBeUndefined();
  });

  it("ignores unsupported hash values", () => {
    window.history.replaceState(null, "", "#?modal=unknown");
    const { result } = renderHook(() => useUserMenuModal());
    expect(result.current[0]).toBeUndefined();
    expect(window.location.hash).toBe("#?modal=unknown");
  });

  it("follows SPA navigation without a hashchange event", () => {
    const { result, rerender } = renderHook(() => useUserMenuModal());
    const router = useAppRouter();

    window.history.pushState(null, "", "#?modal=personal-tools");
    vi.mocked(useAppRouter).mockReturnValue({
      ...router,
      asPath: `${window.location.pathname}${window.location.hash}`,
    });
    rerender();
    expect(result.current[0]).toBe("personal-tools");

    window.history.pushState(null, "", "/w/workspace-id/conversation/other");
    vi.mocked(useAppRouter).mockReturnValue({
      ...router,
      pathname: window.location.pathname,
      asPath: window.location.pathname,
    });
    rerender();
    expect(result.current[0]).toBeUndefined();
    expect(window.location.hash).toBe("");
  });

  it("migrates a legacy query link while preserving query and hash parameters", async () => {
    window.history.replaceState(
      null,
      "",
      "?modal=personal-usage&foo=bar#content?view=list"
    );
    const router = useAppRouter();
    router.query = { modal: "personal-usage", foo: "bar" };
    vi.mocked(router.replace).mockImplementation(async () => {
      window.history.replaceState(null, "", "?foo=bar#content?view=list");
      router.query = { foo: "bar" };
      return true;
    });

    const { result } = renderHook(() => useUserMenuModal());
    await waitFor(() => expect(result.current[0]).toBe("personal-usage"));

    expect(router.replace).toHaveBeenCalledWith(
      {
        pathname: router.pathname,
        query: { foo: "bar" },
        hash: "#content?view=list",
      },
      undefined,
      { shallow: true }
    );
    expect(window.location.search).toBe("?foo=bar");
    expect(window.location.hash).toBe(
      "#content?view=list&modal=personal-usage"
    );

    act(() => result.current[1](undefined));
    expect(window.location.hash).toBe("#content?view=list");
  });
});
