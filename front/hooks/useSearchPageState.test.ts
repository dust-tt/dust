import { getSearchFilterOptions } from "@app/components/shared/filter_panel/searchFilter";
import {
  readSkillFilter,
  skillFilterQuery,
} from "@app/components/skills/skillFilter";
import type { SearchPageQuery } from "@app/hooks/useSearchPageState";
import { useSearchPageState } from "@app/hooks/useSearchPageState";
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration_constants";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { replace, query } = vi.hoisted(() => ({
  replace: vi.fn(),
  query: { current: {} as SearchPageQuery },
}));

vi.mock("@app/lib/platform", () => ({
  useAppRouter: () => ({
    replace,
    pathname: "/w/workspace/builder/skills",
    query: query.current,
  }),
}));

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

afterEach(() => {
  query.current = {};
  replace.mockClear();
  window.history.replaceState({}, "", "/");
});

describe("useSearchPageState", () => {
  it("leaves the default URL unchanged", () => {
    const { result } = renderState();
    expect(result.current.searchTerm).toBe("");
    expect(result.current.selectedTab).toBe("all");
    expect(replace).not.toHaveBeenCalled();
  });

  it("ignores unknown selections and bounds URL filters to the API limits", () => {
    query.current = {
      q: "x".repeat(201),
      tab: "invalid",
      availability: ["invalid", "workspace_users", "workspace_users"],
      editor: ["", "editor-id", "editor-id"],
      tool: Array.from({ length: 101 }, (_, i) => `view-${i}`),
    };
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

  it("replaces the URL with the whole selection and preserves unrelated state", () => {
    query.current = { other: "keep" };
    window.history.replaceState({}, "", "/#?skillId=selected-skill");
    const { result } = renderState();
    act(() => {
      result.current.setSearchTerm("café & report");
      result.current.setSelectedTab("archived");
      result.current.setFilter({
        availability: SKILL_AVAILABILITY_FILTER_OPTIONS,
      });
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(
      {
        pathname: "/w/workspace/builder/skills",
        query: {
          other: "keep",
          q: "café & report",
          tab: "archived",
          availability: SKILL_AVAILABILITY_FILTER_OPTIONS.map(({ id }) => id),
          editor: undefined,
          tool: undefined,
          space: undefined,
        },
        hash: "#?skillId=selected-skill",
      },
      undefined,
      { shallow: true }
    );

    // Opening the copied query restores the same selection.
    query.current = replace.mock.calls[0][0].query;
    const restored = renderState();
    expect(restored.result.current.searchTerm).toBe(result.current.searchTerm);
    expect(restored.result.current.selectedTab).toBe(
      result.current.selectedTab
    );
    expect(skillFilterQuery(restored.result.current.filter)).toMatchObject({
      availability: SKILL_AVAILABILITY_FILTER_OPTIONS.map(({ id }) => id),
    });
  });

  it("omits oversized selections without discarding in-memory or unrelated state", () => {
    query.current = { other: "keep", q: "report" };
    const { result } = renderState();
    act(() => {
      result.current.setFilter(readSkillFilter({ tool: "x".repeat(2_048) }));
    });
    expect(result.current.filter.tool).toHaveLength(1);
    expect(replace).toHaveBeenLastCalledWith(
      {
        pathname: "/w/workspace/builder/skills",
        query: {
          other: "keep",
          q: undefined,
          tab: undefined,
          availability: undefined,
          editor: undefined,
          tool: undefined,
          space: undefined,
        },
        hash: "",
      },
      undefined,
      { shallow: true }
    );
  });
});
