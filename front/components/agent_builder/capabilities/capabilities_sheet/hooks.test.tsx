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

function renderSelection() {
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
    const cursor = "cursor" in body ? body.cursor : null;
    return {
      skills: [
        {
          sId: cursor ? "second" : "first",
          name: cursor ? "Second skill" : "First skill",
          userFacingDescription: "",
          icon: null,
          availability: "workspace_users",
        },
      ],
      hasMore: !cursor,
      nextCursor: cursor ? null : "opaque-cursor",
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
      () =>
        useSkillSelection({
          owner,
          disabled: false,
          alreadyAddedSkillIds: new Set(),
          searchQuery: "",
        }),
      { wrapper }
    ),
    fetcher,
    fetcherWithBody,
  };
}

describe("useSkillSelection", () => {
  beforeEach(() => {
    feature.enabled = true;
  });

  it("keeps selected skills across pages and reads their current edit permission", async () => {
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

    act(() => result.current.skillPagination?.next());
    await waitFor(() =>
      expect(result.current.filteredSkills.map((skill) => skill.sId)).toEqual([
        "second",
      ])
    );
    expect(result.current.selectedSkillIds.has("first")).toBe(true);
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      `/api/w/${owner.sId}/skills/search`,
      expect.objectContaining({ cursor: "opaque-cursor" }),
      "POST",
    ]);
    act(() => result.current.handleSkillToggle("first"));
    expect(result.current.localSelectedSkills).toEqual([]);
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
