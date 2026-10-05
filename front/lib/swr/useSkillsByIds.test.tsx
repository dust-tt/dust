import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import { useSkillsByIds } from "@app/lib/swr/skill_configurations";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { SWRConfig } from "swr";
import { describe, expect, it, vi } from "vitest";

const owner = LightWorkspaceFactory.build();

function setup() {
  const fetcher = vi.fn();
  const fetcherWithBody = vi.fn().mockResolvedValue({ skills: [] });
  const cache = new Map();
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <SWRConfig value={{ provider: () => cache }}>
        <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
          {children}
        </FetcherProvider>
      </SWRConfig>
    );
  }
  return { Wrapper, fetcherWithBody };
}

describe("useSkillsByIds", () => {
  it("deduplicates IDs and skips empty or disabled lookups", async () => {
    const { Wrapper, fetcherWithBody } = setup();
    const { result, rerender } = renderHook(
      ({ skillIds, disabled }) => useSkillsByIds({ owner, skillIds, disabled }),
      {
        wrapper: Wrapper,
        initialProps: { skillIds: ["b", "a", "a"], disabled: false },
      }
    );
    await waitFor(() => expect(result.current.isSkillsLoading).toBe(false));
    expect(fetcherWithBody).toHaveBeenCalledWith([
      `/api/w/${owner.sId}/skills/lookup`,
      { skillIds: ["a", "b"] },
      "POST",
    ]);
    rerender({ skillIds: ["a", "b"], disabled: false });
    expect(fetcherWithBody).toHaveBeenCalledTimes(1);
    rerender({ skillIds: ["c"], disabled: true });
    expect(result.current.skills).toEqual([]);
    expect(result.current.isSkillsLoading).toBe(false);
    rerender({ skillIds: [], disabled: false });
    expect(fetcherWithBody).toHaveBeenCalledTimes(1);
    expect(result.current.isSkillsLoading).toBe(false);
  });

  it("does not restore references from an earlier selection's late response", async () => {
    const { Wrapper, fetcherWithBody } = setup();
    const pending = Promise.withResolvers<{ skills: { sId: string }[] }>();
    fetcherWithBody.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(
      ({ skillIds }) => useSkillsByIds({ owner, skillIds }),
      { wrapper: Wrapper, initialProps: { skillIds: ["removed"] } }
    );
    rerender({ skillIds: [] });
    await act(async () => {
      pending.resolve({ skills: [{ sId: "removed" }] });
    });
    expect(result.current.skills).toEqual([]);
    expect(result.current.isSkillsLoading).toBe(false);
  });
});
