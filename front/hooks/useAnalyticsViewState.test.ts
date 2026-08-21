import { useAnalyticsViewState } from "@app/hooks/useAnalyticsViewState";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockReplace, routerQuery } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  routerQuery: { current: {} as Record<string, string | string[]> },
}));

const PATHNAME = "/w/0ec9852c2f/analytics/consumption";

vi.mock("@app/lib/platform", () => ({
  useAppRouter: () => ({
    replace: mockReplace,
    pathname: PATHNAME,
    query: routerQuery.current,
    isReady: true,
  }),
}));

function renderViewState(query: Record<string, string | string[]>) {
  routerQuery.current = query;
  return renderHook(() => useAnalyticsViewState());
}

describe("useAnalyticsViewState", () => {
  beforeEach(() => {
    mockReplace.mockClear();
  });

  it("starts on the default view and leaves the URL alone", () => {
    const { result } = renderViewState({});

    expect(result.current.period).toEqual({ kind: "cycle" });
    expect(result.current.dimension).toBe("agent");
    expect(result.current.filter).toEqual({});
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("reads the whole view out of the query", () => {
    const { result } = renderViewState({
      period: "30",
      dimension: "model",
      agents: ["8oGtWFRlPa", "aXbYcZdWeV"],
      sources: "slack",
    });

    expect(result.current.period).toEqual({ kind: "days", days: 30 });
    expect(result.current.dimension).toBe("model");
    expect(result.current.filter).toEqual({
      agent: ["8oGtWFRlPa", "aXbYcZdWeV"],
      source: ["slack"],
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("falls back to the default view on a value it cannot read", () => {
    const { result } = renderViewState({ period: "45", dimension: "nope" });

    expect(result.current.period).toEqual({ kind: "cycle" });
    expect(result.current.dimension).toBe("agent");
    expect(mockReplace).toHaveBeenCalledWith(
      {
        pathname: PATHNAME,
        query: expect.objectContaining({
          period: undefined,
          dimension: undefined,
        }),
      },
      undefined,
      { shallow: true }
    );
  });

  it("writes the new view back with replace, preserving other params", () => {
    const { result } = renderViewState({ tab: "explore" });

    act(() => {
      result.current.setDimension("model");
      result.current.setFilter({ source: ["slack"] });
    });

    expect(result.current.dimension).toBe("model");
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith(
      {
        pathname: PATHNAME,
        query: expect.objectContaining({
          tab: "explore",
          dimension: "model",
          sources: ["slack"],
          period: undefined,
          agents: undefined,
        }),
      },
      undefined,
      { shallow: true }
    );
  });

  it("clears the params the view no longer needs", () => {
    const { result } = renderViewState({
      period: "30",
      dimension: "model",
      sources: "slack",
    });

    act(() => {
      result.current.setPeriod({ kind: "cycle" });
      result.current.setDimension("agent");
      result.current.setFilter({});
    });

    expect(mockReplace).toHaveBeenCalledWith(
      {
        pathname: PATHNAME,
        query: {
          period: undefined,
          dimension: undefined,
          agents: undefined,
          users: undefined,
          groups: undefined,
          models: undefined,
          tools: undefined,
          skills: undefined,
          sources: undefined,
          api_keys: undefined,
        },
      },
      undefined,
      { shallow: true }
    );
  });
});
