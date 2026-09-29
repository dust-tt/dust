import type { UsageFilterSourceOption } from "@app/components/workspace/analytics/usageFilter";
import { useAnalyticsViewState } from "@app/hooks/useAnalyticsViewState";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

const PATHNAME = "/w/0ec9852c2f/analytics/consumption";

function encode(json: unknown): string {
  return Buffer.from(JSON.stringify(json)).toString("base64url");
}

function hashState(): unknown {
  const value = new URLSearchParams(window.location.hash.slice(2)).get(
    "search"
  );
  return value
    ? JSON.parse(Buffer.from(value, "base64url").toString())
    : undefined;
}

function renderViewState(hash = "") {
  window.history.replaceState({}, "", `${PATHNAME}${hash}`);
  return renderHook(() => useAnalyticsViewState());
}

function sourceOption(id: string): UsageFilterSourceOption {
  return {
    id,
    name: "Slack",
    kind: "source",
    connectorProvider: id === "slack" ? "slack" : undefined,
    disabled: false,
  };
}

describe("useAnalyticsViewState", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("starts on the default view and leaves the URL alone", () => {
    const { result } = renderViewState();

    expect(result.current.period).toEqual({ kind: "cycle" });
    expect(result.current.dimension).toBe("agent");
    expect(result.current.filter).toEqual({});
    expect(window.location.hash).toBe("");
  });

  it("reads the whole view out of the hash", () => {
    const { result } = renderViewState(
      `#?search=${encode({
        period: 30,
        tab: "model",
        filter: {
          agent: { "8oGtWFRlPa": "Support", aXbYcZdWeV: "Sales" },
          user: { "member-1": "Alice" },
          source: { slack: "Slack" },
        },
      })}`
    );

    expect(result.current.period).toEqual({ kind: "days", days: 30 });
    expect(result.current.dimension).toBe("model");
    expect(result.current.filter.agent?.map(({ name }) => name)).toEqual([
      "Support",
      "Sales",
    ]);
    expect(result.current.filter.member?.[0]?.id).toBe("member-1");
    expect(result.current.filter.source).toEqual([sourceOption("slack")]);
    expect(result.current.restoredOptions.size).toBe(4);
  });

  it("drops the values it cannot read from the hash", () => {
    const { result } = renderViewState(
      `#?search=${encode({ period: 45, tab: "nope" })}`
    );

    expect(result.current.period).toEqual({ kind: "cycle" });
    expect(result.current.dimension).toBe("agent");
    expect(window.location.hash).toBe("");
  });

  it("writes the new view back, preserving other hash params", () => {
    const { result } = renderViewState("#?modal=personal-settings");

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
    expect(result.current.restoredOptions.size).toBe(0);
    expect(
      new URLSearchParams(window.location.hash.slice(2)).get("modal")
    ).toBe("personal-settings");
    expect(hashState()).toEqual({
      tab: "model",
      filter: { user: { "member-1": "Member 1" } },
    });
  });

  it("clears the hash state the view no longer needs", () => {
    const { result } = renderViewState(
      `#?search=${encode({ period: 30, tab: "model", filter: { source: { slack: "Slack" } } })}`
    );

    act(() => {
      result.current.setPeriod({ kind: "cycle" });
      result.current.setDimension("agent");
      result.current.setFilter({});
    });

    expect(hashState()).toBeUndefined();
  });
});
