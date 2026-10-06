import { useSkillBuilderReferences } from "@app/hooks/useSkillBuilderReferences";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { describe, expect, it, vi } from "vitest";

function setup() {
  const owner = LightWorkspaceFactory.build();
  const fetcher = vi.fn();
  const fetcherWithBody = vi.fn();
  const cache = new Map();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SWRConfig value={{ provider: () => cache, shouldRetryOnError: false }}>
        <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
          {children}
        </FetcherProvider>
      </SWRConfig>
    );
  }
  return { owner, fetcher, fetcherWithBody, wrapper: Wrapper };
}

describe("useSkillBuilderReferences", () => {
  it("uses detail requests and retains only readable active references", async () => {
    const { owner, fetcher, fetcherWithBody, wrapper } = setup();
    const skill = {
      sId: "readable",
      name: "Referenced skill",
      icon: null,
      requestedSpaceIds: ["space"],
      canRead: true,
      canWrite: false,
      status: "active",
      availability: "editors",
    };
    fetcher
      .mockResolvedValueOnce({ skill })
      .mockResolvedValueOnce({ skill: { ...skill, status: "archived" } })
      .mockResolvedValueOnce({ skill: { ...skill, canRead: false } })
      .mockRejectedValueOnce({
        error: { type: "skill_not_found", message: "Not found" },
      });
    const skillIds = ["readable", "archived", "redacted", "missing"];

    const { result } = renderHook(
      () => useSkillBuilderReferences({ owner, skillIds }),
      { wrapper }
    );

    expect(result.current.isReferencesLoading).toBe(true);
    await waitFor(() => expect(result.current.isReferencesLoading).toBe(false));
    expect(result.current.references).toEqual([skill]);
    expect(result.current.isReferencesError).toBe(false);
    expect(fetcher.mock.calls).toEqual(
      skillIds.map((id) => [`/api/w/${owner.sId}/skills/${id}`])
    );
    expect(fetcherWithBody).not.toHaveBeenCalled();
  });

  it("does not fetch when there are no unresolved references", () => {
    const { owner, fetcher, wrapper } = setup();
    const { result } = renderHook(
      () => useSkillBuilderReferences({ owner, skillIds: [] }),
      { wrapper }
    );

    expect(result.current.references).toEqual([]);
    expect(result.current.isReferencesLoading).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("discards a late response after the reference is removed", async () => {
    const { owner, fetcher, wrapper } = setup();
    const response = Promise.withResolvers<{
      skill: { sId: string; canRead: boolean; status: string };
    }>();
    fetcher.mockReturnValue(response.promise);
    const { result, rerender } = renderHook(
      ({ skillIds }: { skillIds: string[] }) =>
        useSkillBuilderReferences({ owner, skillIds }),
      { wrapper, initialProps: { skillIds: ["removed"] } }
    );

    rerender({ skillIds: [] });
    await act(async () => {
      response.resolve({
        skill: { sId: "removed", canRead: true, status: "active" },
      });
      await response.promise;
    });

    expect(result.current.references).toEqual([]);
    expect(result.current.isReferencesLoading).toBe(false);
  });

  it("reports request failures instead of treating them as missing skills", async () => {
    const { owner, fetcher, wrapper } = setup();
    fetcher.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(
      () => useSkillBuilderReferences({ owner, skillIds: ["reference"] }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isReferencesError).toBe(true));
    expect(result.current.isReferencesLoading).toBe(false);
  });
});
