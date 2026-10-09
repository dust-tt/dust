import {
  useInputBarSlashCommandCapabilities,
  useSkillBuilderSlashCommandCapabilities,
} from "@app/components/editor/extensions/shared/slash_suggestion/useSlashCommandCapabilities";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { AuthContext } from "@app/lib/auth/AuthContext";
import type { FetcherFn, FetcherWithBodyFn } from "@app/lib/swr/fetcher";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { StarFilled } from "@dust-tt/sparkle";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { describe, expect, it, vi } from "vitest";

interface WrapperProps {
  children: ReactNode;
}

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
    featureFlags: [],
    vizUrl: "http://localhost",
    providersHealth: null,
    workspacePermissions: await auth.getWorkspacePermissions(),
  };
  const listedSkills = [
    { sId: "zulu", name: "Zulu", icon: null },
    { sId: "beta", name: "Beta", icon: null },
    { sId: "alpha", name: "Alpha", icon: null },
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
  const favoriteSkills = hasFavorites ? listedSkills.slice(0, 2) : [];
  const fetcherWithBody = vi.fn<FetcherWithBodyFn>(async ([, body]) => {
    const { query, selectionMode } = body as {
      query: string;
      selectionMode: string;
    };
    const skills =
      selectionMode === "favorites_only" || (hasFavorites && !query.trim())
        ? favoriteSkills
        : [listedSkills[2]];
    return { skills, total: skills.length, hasMore: false, facets: {} };
  });
  const swrConfig = { provider: () => new Map(), shouldRetryOnError: false };
  const wrapper = ({ children }: WrapperProps) => (
    <AuthContext.Provider value={context}>
      <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
        <SWRConfig value={swrConfig}>{children}</SWRConfig>
      </FetcherProvider>
    </AuthContext.Provider>
  );
  return { owner, fetcher, fetcherWithBody, wrapper };
}

function searchCalls(
  fetcherWithBody: ReturnType<typeof vi.fn<FetcherWithBodyFn>>
) {
  return fetcherWithBody.mock.calls.filter(
    ([[, body]]) =>
      (body as { selectionMode: string }).selectionMode !== "favorites_only"
  );
}

describe.each([
  ["input bar", useInputBarSlashCommandCapabilities],
  ["skill builder", useSkillBuilderSlashCommandCapabilities],
] as const)("%s slash capabilities", (_name, useCapabilities) => {
  it.each(["", "   "])(
    "uses only the search endpoint for alphabetical favorites with query %j",
    async (query) => {
      const { owner, fetcher, fetcherWithBody, wrapper } = await setup();
      const { result } = renderHook(() => useCapabilities({ owner, query }), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.capabilityItems.map((item) => item.id)).toEqual([
        "beta",
        "zulu",
      ]);
      expect(searchCalls(fetcherWithBody)).toHaveLength(1);
      expect(fetcher.mock.calls.some(([url]) => url.includes("/skills"))).toBe(
        false
      );
    }
  );

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
      expect.objectContaining({ query: "", selectionMode: "favorites_or_all" }),
      "POST",
    ]);
  });

  it("uses the existing search once typing starts", async () => {
    const { owner, fetcher, fetcherWithBody, wrapper } = await setup();
    const { result, rerender } = renderHook(
      ({ query }) => useCapabilities({ owner, query }),
      {
        wrapper,
        initialProps: { query: "" },
      }
    );
    await waitFor(() => expect(result.current.capabilityItems).toHaveLength(2));
    expect(searchCalls(fetcherWithBody)).toHaveLength(1);
    expect(fetcher.mock.calls.some(([url]) => url.includes("/skills"))).toBe(
      false
    );

    rerender({ query: "al" });

    await waitFor(() =>
      expect(result.current.capabilityItems.map((item) => item.id)).toEqual([
        "alpha",
      ])
    );
    expect(fetcherWithBody).toHaveBeenCalledWith([
      `/api/w/${owner.sId}/skills/search`,
      expect.objectContaining({
        query: "al",
        selectionMode: "favorites_or_all",
      }),
      "POST",
    ]);
  });
});

describe("input bar slash capabilities favorites", () => {
  it("stars favorite skills whatever the query", async () => {
    const { owner, wrapper } = await setup();
    const { result, rerender } = renderHook(
      ({ query }) => useInputBarSlashCommandCapabilities({ owner, query }),
      { wrapper, initialProps: { query: "" } }
    );

    await waitFor(() =>
      expect(
        result.current.capabilityItems.map((item) => [item.id, item.endIcon])
      ).toEqual([
        ["beta", StarFilled],
        ["zulu", StarFilled],
      ])
    );

    rerender({ query: "al" });

    await waitFor(() =>
      expect(
        result.current.capabilityItems.map((item) => [item.id, item.endIcon])
      ).toEqual([["alpha", undefined]])
    );
  });
});
