import { useInvalidateSkills } from "@app/hooks/useInvalidateSkills";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import useSWR, { SWRConfig } from "swr";
import { describe, expect, it, vi } from "vitest";

describe("useInvalidateSkills", () => {
  it("refreshes list variants and search pages only in the requested workspace", async () => {
    const fetcher = vi.fn().mockResolvedValue("initial");
    const skillsUrl = "/api/w/workspace-a/skills";
    const cache = new Map();
    const wrapper = ({ children }: PropsWithChildren) => (
      <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
        {children}
      </SWRConfig>
    );
    const { result } = renderHook(
      () => ({
        invalidate: useInvalidateSkills({ workspaceId: "workspace-a" }),
        all: useSWR(skillsUrl, fetcher).data,
        active: useSWR(`${skillsUrl}?status=active`, fetcher).data,
        archived: useSWR(
          `${skillsUrl}?withRelations=true&status=archived`,
          fetcher
        ).data,
        custom: useSWR(
          `${skillsUrl}?withRelations=true&status=active&onlyCustom=true`,
          fetcher
        ).data,
        search: useSWR(
          [`${skillsUrl}/search`, { query: "", offset: 0 }],
          fetcher
        ).data,
        nextPage: useSWR(
          [`${skillsUrl}/search`, { query: "report", offset: 25 }],
          fetcher
        ).data,
        otherWorkspace: useSWR(
          "/api/w/workspace-b/skills?status=active",
          fetcher
        ).data,
        otherSearch: useSWR(
          ["/api/w/workspace-b/skills/search", { query: "" }],
          fetcher
        ).data,
        detail: useSWR(`${skillsUrl}/skill-a?withRelations=true`, fetcher).data,
      }),
      { wrapper }
    );

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(9);
      expect(result.current.detail).toBe("initial");
    });
    fetcher.mockResolvedValue("updated");

    await act(async () => {
      await result.current.invalidate();
    });

    expect(result.current.all).toBe("updated");
    expect(result.current.active).toBe("updated");
    expect(result.current.archived).toBe("updated");
    expect(result.current.custom).toBe("updated");
    expect(result.current.search).toBe("updated");
    expect(result.current.nextPage).toBe("updated");
    expect(result.current.otherWorkspace).toBe("initial");
    expect(result.current.otherSearch).toBe("initial");
    expect(result.current.detail).toBe("initial");
  });
});
