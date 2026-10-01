import { useSkillSelection } from "@app/components/agent_builder/capabilities/capabilities_sheet/hooks";
import { SkillsProvider } from "@app/components/shared/skills/SkillsContext";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import type { FetcherWithBodyFn } from "@app/lib/swr/fetcher";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";

const feature = vi.hoisted(() => ({ enabled: true }));
vi.mock(import("@app/lib/auth/AuthContext"), () => ({
  useFeatureFlags: () => ({
    featureFlags: [],
    hasFeature: () => feature.enabled,
  }),
}));

const owner = LightWorkspaceFactory.build();
const legacySkill = {
  sId: "legacy",
  name: "Legacy skill",
  userFacingDescription: "",
  icon: null,
  availability: "workspace_users",
  editedBy: 1,
  canWrite: true,
};

function renderSelection(alreadyAddedSkillIds = new Set<string>()) {
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes("?withRelations=true")) {
      return {
        skill: {
          ...legacySkill,
          sId: "first",
          name: "First skill",
          canWrite: false,
        },
      };
    }
    return { skills: [legacySkill] };
  });
  const fetcherWithBody = vi.fn<FetcherWithBodyFn>(async ([, body]) => {
    const offset = "offset" in body ? body.offset : 0;
    const query = "query" in body ? body.query : "";
    const [sId, name] = query
      ? ["match", "Matching skill"]
      : offset
        ? ["second", "Second skill"]
        : ["first", "First skill"];
    return {
      skills: [
        {
          sId,
          name,
          userFacingDescription: "",
          icon: null,
          availability: "workspace_users",
        },
      ],
      hasMore: !query && !offset,
      total: 101,
      facets: {},
    };
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
        <SkillsProvider owner={owner}>{children}</SkillsProvider>
      </FetcherProvider>
    </SWRConfig>
  );
  return {
    ...renderHook(
      ({ searchQuery, disabled }) =>
        useSkillSelection({
          owner,
          disabled,
          alreadyAddedSkillIds,
          searchQuery,
        }),
      { wrapper, initialProps: { searchQuery: "", disabled: false } }
    ),
    fetcher,
    fetcherWithBody,
  };
}

describe("useSkillSelection", () => {
  beforeEach(() => {
    feature.enabled = true;
  });

  it("appends pages, keeps selected skills, and reads their current edit permission", async () => {
    const { result, fetcher, fetcherWithBody } = renderSelection();
    await waitFor(() =>
      expect(result.current.filteredSkills.map((skill) => skill.sId)).toEqual([
        "first",
      ])
    );
    expect(fetcher).not.toHaveBeenCalledWith(
      expect.stringContaining("withRelations")
    );

    act(() => result.current.handleSkillToggle("first"));
    await waitFor(() =>
      expect(result.current.localSelectedSkills).toEqual([
        expect.objectContaining({ sId: "first", canWrite: false }),
      ])
    );
    expect(fetcher).toHaveBeenCalledWith(
      `/api/w/${owner.sId}/skills/first?withRelations=true`
    );

    act(() => result.current.skillPagination?.loadMore());
    await waitFor(() =>
      expect(result.current.filteredSkills.map((skill) => skill.sId)).toEqual([
        "first",
        "second",
      ])
    );
    expect(result.current.selectedSkillIds.has("first")).toBe(true);
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      `/api/w/${owner.sId}/skills/search`,
      expect.objectContaining({ offset: 100, limit: 100 }),
      "POST",
    ]);
    act(() => result.current.handleSkillToggle("first"));
    expect(result.current.localSelectedSkills).toEqual([]);
    act(() => result.current.skillPagination?.loadMore());
    expect(fetcherWithBody).toHaveBeenCalledTimes(2);
  });

  it("keeps the previous results and tool query while searching, then starts at offset zero", async () => {
    const { result, rerender, fetcherWithBody } = renderSelection();
    await waitFor(() => expect(result.current.isSkillsLoading).toBe(false));
    act(() => result.current.skillPagination?.loadMore());
    await waitFor(() => expect(result.current.filteredSkills).toHaveLength(2));

    rerender({ searchQuery: "ask", disabled: false });
    expect(result.current.filteredSkills.map((skill) => skill.sId)).toEqual([
      "first",
      "second",
    ]);
    expect(result.current.resolvedSearchQuery).toBe("");
    expect(result.current.isSkillsLoading).toBe(true);
    act(() => result.current.skillPagination?.loadMore());
    expect(fetcherWithBody).toHaveBeenCalledTimes(2);

    await waitFor(() =>
      expect(result.current.filteredSkills.map((skill) => skill.sId)).toEqual([
        "match",
      ])
    );
    expect(result.current.resolvedSearchQuery).toBe("ask");
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      `/api/w/${owner.sId}/skills/search`,
      expect.objectContaining({ query: "ask", offset: 0, limit: 100 }),
      "POST",
    ]);
  });

  it("can advance past already-added skills and stops fetching when closed", async () => {
    const { result, rerender, fetcherWithBody } = renderSelection(
      new Set(["first"])
    );
    await waitFor(() => expect(result.current.isSkillsLoading).toBe(false));
    expect(result.current.filteredSkills).toEqual([]);
    expect(result.current.skillPagination).toMatchObject({
      hasMore: true,
      loadedCount: 1,
    });

    rerender({ searchQuery: "", disabled: true });
    expect(result.current.isSkillsLoading).toBe(false);
    expect(result.current.filteredSkills).toEqual([]);
    act(() => result.current.skillPagination?.loadMore());
    expect(fetcherWithBody).toHaveBeenCalledTimes(1);

    rerender({ searchQuery: "", disabled: false });
    await waitFor(() => expect(result.current.isSkillsLoading).toBe(false));
    act(() => result.current.skillPagination?.loadMore());
    await waitFor(() =>
      expect(result.current.filteredSkills.map((skill) => skill.sId)).toEqual([
        "second",
      ])
    );
    expect(result.current.skillPagination?.loadedCount).toBe(2);
  });

  it("uses the existing context without search or detail fetches when the flag is off", async () => {
    feature.enabled = false;
    const { result, fetcher, fetcherWithBody } = renderSelection();
    await waitFor(() =>
      expect(result.current.filteredSkills.map((skill) => skill.sId)).toEqual([
        "legacy",
      ])
    );
    act(() => result.current.handleSkillToggle("legacy"));
    expect(result.current.localSelectedSkills).toEqual([
      expect.objectContaining({ sId: "legacy", canWrite: true }),
    ]);
    expect(result.current.skillPagination).toBeNull();
    expect(fetcherWithBody).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalledWith(
      expect.stringContaining("withRelations")
    );
  });
});
