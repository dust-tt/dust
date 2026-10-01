import {
  useInputBarSlashCommandCapabilities,
  useSkillBuilderSlashCommandCapabilities,
} from "@app/components/editor/extensions/shared/slash_suggestion/useSlashCommandCapabilities";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { AuthContext } from "@app/lib/auth/AuthContext";
import type { FetcherFn, FetcherWithBodyFn } from "@app/lib/swr/fetcher";
import { FetcherProvider } from "@app/lib/swr/swr";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { describe, expect, it, vi } from "vitest";

async function setup(hasFavorites = true) {
  const { authenticator: auth, user } = await createResourceTest({
    role: "user",
  });
  const owner = auth.getNonNullableWorkspace();
  const context: AuthContextValue = {
    workspace: owner,
    user: user.toJSON(),
    subscription: auth.getNonNullableSubscription(),
    isAdmin: false,
    isManager: false,
    featureFlags: ["skills_search"],
    vizUrl: "http://localhost",
    providersHealth: null,
    workspacePermissions: await auth.getWorkspacePermissions(),
  };
  const listedSkills = [
    { sId: "zulu", name: "Zulu", isFavorite: hasFavorites, icon: null },
    { sId: "beta", name: "Beta", isFavorite: hasFavorites, icon: null },
    { sId: "alpha", name: "Alpha", isFavorite: false, icon: null },
  ];
  const fetcher = vi.fn<FetcherFn>(async (url) => {
    if (url.includes("/skills")) {
      return { skills: listedSkills };
    }
    if (url.includes("/spaces")) {
      return { spaces: [] };
    }
    return { serverViews: [] };
  });
  const fetcherWithBody = vi.fn<FetcherWithBodyFn>().mockResolvedValue({
    skills: [listedSkills[2]],
    total: 1,
    hasMore: false,
    facets: {},
  });
  const swrConfig = { provider: () => new Map(), shouldRetryOnError: false };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthContext.Provider value={context}>
      <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
        <SWRConfig value={swrConfig}>{children}</SWRConfig>
      </FetcherProvider>
    </AuthContext.Provider>
  );
  return { owner, fetcherWithBody, wrapper };
}

describe.each([
  ["input bar", useInputBarSlashCommandCapabilities],
  ["skill builder", useSkillBuilderSlashCommandCapabilities],
] as const)("%s slash capabilities", (_name, useCapabilities) => {
  it.each([
    "",
    "   ",
  ])("lists only alphabetical favorites without searching for %j", async (query) => {
    const { owner, fetcherWithBody, wrapper } = await setup();
    const { result } = renderHook(() => useCapabilities({ owner, query }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.capabilityItems.map((item) => item.id)).toEqual([
      "beta",
      "zulu",
    ]);
    expect(fetcherWithBody).not.toHaveBeenCalled();
  });

  it("uses the existing search when there are no favorites", async () => {
    const { owner, fetcherWithBody, wrapper } = await setup(false);
    const { result } = renderHook(() => useCapabilities({ owner, query: "" }), {
      wrapper,
    });

    await waitFor(() =>
      expect(result.current.capabilityItems.map((item) => item.id)).toEqual([
        "alpha",
      ])
    );
    expect(fetcherWithBody).toHaveBeenCalledWith([
      `/api/w/${owner.sId}/skills/search`,
      expect.objectContaining({ query: "" }),
      "POST",
    ]);
  });

  it("uses the existing search once typing starts", async () => {
    const { owner, fetcherWithBody, wrapper } = await setup();
    const { result, rerender } = renderHook(
      ({ query }) => useCapabilities({ owner, query }),
      {
        wrapper,
        initialProps: { query: "" },
      }
    );
    await waitFor(() => expect(result.current.capabilityItems).toHaveLength(2));
    expect(fetcherWithBody).not.toHaveBeenCalled();

    rerender({ query: "al" });

    await waitFor(() =>
      expect(result.current.capabilityItems.map((item) => item.id)).toEqual([
        "alpha",
      ])
    );
    expect(fetcherWithBody).toHaveBeenCalledWith([
      `/api/w/${owner.sId}/skills/search`,
      expect.objectContaining({ query: "al" }),
      "POST",
    ]);
  });
});
