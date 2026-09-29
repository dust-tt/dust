import { Buffer } from "node:buffer";
import { getSearchFilterOptions } from "@app/components/shared/filter_panel/searchFilter";
import {
  readSkillFilter,
  skillFilterQuery,
} from "@app/components/skills/skillFilter";
import type { SearchPageQuery } from "@app/hooks/useSearchPageState";
import { useSearchPageState } from "@app/hooks/useSearchPageState";
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration_constants";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

const tabs = [{ id: "all" }, { id: "archived" }];
const SKILL_AVAILABILITY_FILTER_OPTIONS = getSearchFilterOptions(
  "availability",
  {
    availability: SKILL_AVAILABILITIES.map((availability) => ({
      availability,
    })),
  },
  ""
);
const renderState = () =>
  renderHook(() =>
    useSearchPageState({
      tabs,
      readFilter: readSkillFilter,
      filterQuery: skillFilterQuery,
    })
  );

function encodedQuery(query: SearchPageQuery): string {
  return Buffer.from(JSON.stringify(query)).toString("base64url");
}

function hashQuery(): SearchPageQuery {
  const encoded = new URLSearchParams(window.location.hash.split("?")[1]).get(
    "filter"
  );
  return encoded
    ? JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
    : {};
}

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("useSearchPageState", () => {
  it("leaves the default URL unchanged", () => {
    const { result } = renderState();
    expect(result.current.searchTerm).toBe("");
    expect(result.current.selectedTab).toBe("all");
    expect(window.location.hash).toBe("");
  });

  it("ignores unknown selections and bounds decoded filters to the API limits", () => {
    const encoded = encodedQuery({
      q: "x".repeat(201),
      tab: "invalid",
      availability: ["invalid", "workspace_users", "workspace_users"],
      editor: ["", "editor-id", "editor-id"],
      tool: Array.from({ length: 101 }, (_, i) => `view-${i}`),
    });
    window.history.replaceState({}, "", `/#?filter=${encoded}`);
    const { result } = renderState();
    expect(result.current.searchTerm).toHaveLength(201);
    expect(result.current.selectedTab).toBe("all");
    expect(skillFilterQuery(result.current.filter)).toEqual({
      availability: ["workspace_users"],
      editor: ["editor-id"],
      space: undefined,
      tool: Array.from({ length: 100 }, (_, i) => `view-${i}`),
    });
  });

  it("replaces one base64url hash value and preserves unrelated URL state", () => {
    window.history.replaceState(
      {},
      "",
      "/w/workspace/builder/skills?other=keep#?skillId=selected-skill"
    );
    const { result } = renderState();
    act(() => {
      result.current.setSearchTerm("café & report");
      result.current.setSelectedTab("archived");
      result.current.setFilter({
        availability: SKILL_AVAILABILITY_FILTER_OPTIONS,
      });
    });
    expect(window.location.search).toBe("?other=keep");
    expect(
      new URLSearchParams(window.location.hash.slice(2)).get("skillId")
    ).toBe("selected-skill");
    expect(hashQuery()).toMatchObject({
      q: "café & report",
      tab: "archived",
      availability: SKILL_AVAILABILITY_FILTER_OPTIONS.map(({ id }) => id),
    });

    const restored = renderState();
    expect(restored.result.current.searchTerm).toBe(result.current.searchTerm);
    expect(restored.result.current.selectedTab).toBe(
      result.current.selectedTab
    );
    expect(skillFilterQuery(restored.result.current.filter)).toMatchObject({
      availability: SKILL_AVAILABILITY_FILTER_OPTIONS.map(({ id }) => id),
    });
  });

  it("follows external hash edits and browser history changes", () => {
    const { result } = renderState();
    act(() => {
      window.history.pushState(
        {},
        "",
        `/#?filter=${encodedQuery({ q: "external", tab: "archived" })}`
      );
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(result.current.searchTerm).toBe("external");
    expect(result.current.selectedTab).toBe("archived");

    act(() => {
      window.history.replaceState(
        {},
        "",
        `/#?filter=${encodedQuery({ availability: ["workspace_users"] })}`
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.searchTerm).toBe("");
    expect(result.current.selectedTab).toBe("all");
    expect(skillFilterQuery(result.current.filter).availability).toEqual([
      "workspace_users",
    ]);
  });

  it("ignores malformed base64 and omits oversized selections without losing local state", () => {
    window.history.replaceState({}, "", "/#?filter=invalid!&skillId=keep");
    const { result } = renderState();
    expect(result.current.filter).toEqual({
      availability: [],
      editor: [],
      tool: [],
      space: [],
    });
    act(() => {
      result.current.setFilter(readSkillFilter({ tool: "x".repeat(2_048) }));
    });
    expect(result.current.filter.tool).toHaveLength(1);
    expect(
      new URLSearchParams(window.location.hash.slice(2)).get("filter")
    ).toBeNull();
    expect(
      new URLSearchParams(window.location.hash.slice(2)).get("skillId")
    ).toBe("keep");

    act(() => {
      window.history.replaceState(
        {},
        "",
        `/#?skillId=keep&filter=${encodedQuery({ q: "new link" })}`
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.searchTerm).toBe("new link");
    expect(result.current.filter.tool).toHaveLength(0);
  });
});
