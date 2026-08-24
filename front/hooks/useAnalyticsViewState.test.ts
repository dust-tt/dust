import type { UsageFilterSourceOption } from "@app/components/workspace/analytics/usageFilter";
import { useAnalyticsViewState } from "@app/hooks/useAnalyticsViewState";
import { MAX_ANALYTICS_URL_LENGTH } from "@app/lib/analytics/view_params";
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

function sourceOption(id: string): UsageFilterSourceOption {
  return {
    id,
    name: id,
    kind: "source",
    connectorProvider: id === "slack" ? "slack" : undefined,
    disabled: false,
  };
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
      p: "30",
      d: "model",
      a: ["8oGtWFRlPa", "aXbYcZdWeV"],
      u: "member-1",
      s: "slack",
    });

    expect(result.current.period).toEqual({ kind: "days", days: 30 });
    expect(result.current.dimension).toBe("model");
    expect(result.current.filter.agent?.map(({ id }) => id)).toEqual([
      "8oGtWFRlPa",
      "aXbYcZdWeV",
    ]);
    expect(result.current.filter.member?.[0]?.id).toBe("member-1");
    expect(result.current.filter.source).toEqual([sourceOption("slack")]);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("falls back to the default view on a value it cannot read", () => {
    const { result } = renderViewState({ p: "45", d: "nope" });

    expect(result.current.period).toEqual({ kind: "cycle" });
    expect(result.current.dimension).toBe("agent");
    expect(mockReplace).toHaveBeenCalledWith(
      {
        pathname: PATHNAME,
        query: expect.objectContaining({
          p: undefined,
          d: undefined,
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
      result.current.setFilter({
        member: [
          {
            id: "member-1",
            name: "Member 1",
            kind: "member",
            image: null,
            disabled: false,
          },
        ],
      });
    });

    expect(result.current.dimension).toBe("model");
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith(
      {
        pathname: PATHNAME,
        query: expect.objectContaining({
          tab: "explore",
          d: "model",
          u: ["member-1"],
          p: undefined,
          a: undefined,
        }),
      },
      undefined,
      { shallow: true }
    );
  });

  it("clears the params the view no longer needs", () => {
    const { result } = renderViewState({
      p: "30",
      d: "model",
      s: "slack",
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
          p: undefined,
          d: undefined,
          a: undefined,
          u: undefined,
          g: undefined,
          m: undefined,
          t: undefined,
          sk: undefined,
          s: undefined,
          k: undefined,
        },
      },
      undefined,
      { shallow: true }
    );
  });

  it("drops the whole query when the URL would be too long", () => {
    const { result } = renderViewState({ tab: "explore" });

    act(() => {
      result.current.setFilter({
        source: [sourceOption("x".repeat(MAX_ANALYTICS_URL_LENGTH))],
      });
    });

    expect(mockReplace).toHaveBeenCalledWith(
      {
        pathname: PATHNAME,
        query: {},
      },
      undefined,
      { shallow: true }
    );
  });
});
