import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import type { FetcherFn, FetcherWithBodyFn } from "@app/lib/swr/fetcher";
import { useUpdateSkillReinforcement } from "@app/lib/swr/skill_configurations";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import useSWR, { SWRConfig } from "swr";
import { describe, expect, it, vi } from "vitest";

describe("useUpdateSkillReinforcement", () => {
  it("refreshes settings without refreshing skill lists or search results", async () => {
    const { workspace } = await createResourceTest({});
    const skillsUrl = `/api/w/${workspace.sId}/skills`;
    const requestFetcher = vi.fn<FetcherFn>().mockResolvedValue({});
    const fetcherWithBody = vi.fn<FetcherWithBodyFn>();
    const listFetcher = vi.fn().mockResolvedValue("initial");
    const cache = new Map();
    const wrapper = ({ children }: PropsWithChildren) => (
      <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
        <FetcherProvider
          fetcher={requestFetcher}
          fetcherWithBody={fetcherWithBody}
        >
          {children}
        </FetcherProvider>
      </SWRConfig>
    );
    const { result } = renderHook(
      () => ({
        ...useUpdateSkillReinforcement({ owner: workspace }),
        settings: useSWR(`${skillsUrl}/reinforcement_settings`, listFetcher)
          .data,
        skills: useSWR(`${skillsUrl}?withRelations=true`, listFetcher).data,
        search: useSWR(
          [`${skillsUrl}/search`, { query: "", offset: 0 }],
          listFetcher
        ).data,
        otherSettings: useSWR(
          "/api/w/other-workspace/skills/reinforcement_settings",
          listFetcher
        ).data,
      }),
      { wrapper }
    );
    await waitFor(() => {
      expect(listFetcher).toHaveBeenCalledTimes(4);
      expect(result.current.settings).toBe("initial");
    });
    listFetcher.mockResolvedValue("updated");

    await act(async () => {
      const success = await result.current.updateSkillReinforcement("skill-a", {
        reinforcement: "off",
      });
      expect(success).toBe(true);
    });

    await waitFor(() => expect(result.current.settings).toBe("updated"));
    expect(listFetcher).toHaveBeenCalledTimes(5);
    expect(result.current.skills).toBe("initial");
    expect(result.current.search).toBe("initial");
    expect(result.current.otherSettings).toBe("initial");
    expect(requestFetcher).toHaveBeenCalledWith(
      `${skillsUrl}/skill-a/reinforcement`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reinforcement: "off" }),
      }
    );
  });
});
