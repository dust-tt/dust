import { trackEvent } from "@app/lib/tracking";
import type { ManageTracking } from "@app/lib/tracking/manageTracking";
import {
  ManageTrackingContext,
  trackManageDetails,
  trackManageMutation,
  useManagePageTracking,
  useTrackManageResults,
} from "@app/lib/tracking/manageTracking";
import { render, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/tracking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/tracking")>();
  return { ...actual, trackEvent: vi.fn() };
});

const emit = vi.mocked(trackEvent);
const tracking: ManageTracking = {
  entity_type: "skill",
  manage_session_id: "visit-1",
  search_id: "search-1",
  tab: "all",
  has_search: true,
  filter_count: 1,
  filter_categories: "editor",
  show_hidden: false,
};

beforeEach(() => emit.mockClear());

describe("Manage journey tracking", () => {
  it("keeps a visit ID across searches without emitting query text or filter values", () => {
    const props = {
      entityType: "skill" as const,
      workspaceId: "workspace-1",
      queryKey: "private query and editor name",
      tab: "all",
      hasSearch: true,
      filterCount: 1,
      filterCategories: "editor",
      showHidden: false,
      disabled: false,
    };
    const { result, rerender } = renderHook(useManagePageTracking, {
      initialProps: props,
    });
    const first = result.current;
    rerender({ ...props, queryKey: "another private query" });
    expect(result.current?.manage_session_id).toBe(first?.manage_session_id);
    expect(result.current?.search_id).not.toBe(first?.search_id);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({
      area: "builder",
      object: "manage_page",
      action: "view",
      extra: first,
    });
    expect(JSON.stringify(emit.mock.calls)).not.toContain("private query");
  });

  it("waits for results, deduplicates refreshes, and distinguishes errors from zero results", () => {
    const props = { total: 5, isLoading: true, isError: false, pageIndex: 0 };
    const { rerender } = renderHook(useTrackManageResults, {
      initialProps: props,
      wrapper: ({ children }) => (
        <ManageTrackingContext.Provider value={tracking}>
          {children}
        </ManageTrackingContext.Provider>
      ),
    });
    expect(emit).not.toHaveBeenCalled();
    rerender({ ...props, isLoading: false, isError: true });
    expect(emit).toHaveBeenLastCalledWith({
      area: "builder",
      object: "manage_results",
      action: "view",
      extra: { ...tracking, outcome: "error" },
    });
    rerender({ ...props, total: 0, isLoading: false });
    expect(emit).toHaveBeenLastCalledWith({
      area: "builder",
      object: "manage_results",
      action: "view",
      extra: { ...tracking, outcome: "success", result_count: 0 },
    });
    rerender({ ...props, isLoading: false, pageIndex: 1 });
    rerender({ ...props, isLoading: false });
    rerender({ ...props, isLoading: false, isError: true });
    rerender({ ...props, isLoading: false });
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it("attributes retained rows to their loaded result set", () => {
    let current = tracking;
    const { result, rerender } = renderHook(useTrackManageResults, {
      initialProps: {
        total: 5,
        isLoading: false,
        isError: false,
        pageIndex: 0,
      },
      wrapper: ({ children }) => (
        <ManageTrackingContext.Provider value={current}>
          {children}
        </ManageTrackingContext.Provider>
      ),
    });
    current = { ...tracking, search_id: "search-2" };
    rerender({ total: 5, isLoading: true, isError: false, pageIndex: 0 });
    trackManageDetails(result.current, "skill-1");
    expect(emit).toHaveBeenLastCalledWith({
      area: "builder",
      object: "manage_details",
      action: "open",
      extra: { ...tracking, target_id: "skill-1" },
    });
    rerender({ total: 2, isLoading: false, isError: false, pageIndex: 0 });
    expect(result.current?.search_id).toBe("search-2");
    expect(emit).toHaveBeenLastCalledWith({
      area: "builder",
      object: "manage_results",
      action: "view",
      extra: { ...current, outcome: "success", result_count: 2 },
    });
  });

  it("emits a page view before results, once even with strict effects", () => {
    function Results() {
      useTrackManageResults({
        total: 1,
        isLoading: false,
        isError: false,
        pageIndex: 0,
      });
      return null;
    }
    function Page() {
      const context = useManagePageTracking({
        entityType: "agent",
        workspaceId: "workspace-1",
        queryKey: "",
        tab: "all",
        hasSearch: false,
        filterCount: 0,
        filterCategories: "",
        showHidden: false,
        disabled: false,
      });
      return (
        <ManageTrackingContext.Provider value={context}>
          <Results />
        </ManageTrackingContext.Provider>
      );
    }
    render(
      <StrictMode>
        <Page />
      </StrictMode>
    );
    expect(emit.mock.calls.map(([event]) => event.object)).toEqual([
      "manage_page",
      "manage_results",
    ]);
  });

  it("ignores read-only listings and actions outside Manage", () => {
    renderHook(() =>
      useManagePageTracking({
        entityType: "agent",
        workspaceId: "workspace-1",
        queryKey: "",
        tab: "all",
        hasSearch: false,
        filterCount: 0,
        filterCategories: "",
        showHidden: false,
        disabled: true,
      })
    );
    renderHook(() =>
      useTrackManageResults({
        total: 3,
        isLoading: false,
        isError: false,
        pageIndex: 0,
      })
    );
    trackManageDetails(null, "agent-1");
    trackManageMutation(null, "archive", ["agent-1"]);
    expect(emit).not.toHaveBeenCalled();
  });
});
