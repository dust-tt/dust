import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import { usePodDefaultSkills, useUpdatePodMetadata } from "@app/lib/swr/pods";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { SWRConfig } from "swr";
import { expect, it, vi } from "vitest";

const { clientFetch } = vi.hoisted(() => ({ clientFetch: vi.fn() }));
vi.mock("@app/lib/egress/client", () => ({ clientFetch }));
vi.mock("@app/hooks/useNotification", () => ({
  useSendNotification: () => vi.fn(),
  useSendApiErrorNotification: () => vi.fn(),
}));

it("reads only metadata and refreshes resolved defaults after changing their IDs", async () => {
  const owner = LightWorkspaceFactory.build();
  const podId = "pod";
  const fetcher = vi.fn().mockResolvedValue({
    projectMetadata: { defaultSkillIds: ["first"] },
    defaultSkills: [{ sId: "first", name: "First", icon: null }],
  });
  const fetcherWithBody = vi.fn();
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
  const { result } = renderHook(
    () => ({
      ...usePodDefaultSkills({ owner, podId }),
      update: useUpdatePodMetadata({ owner, podId }),
    }),
    { wrapper: Wrapper }
  );
  await waitFor(() =>
    expect(result.current.defaultSkills.map((skill) => skill.sId)).toEqual([
      "first",
    ])
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith(
    `/api/w/${owner.sId}/spaces/${podId}/project_metadata`
  );

  fetcher.mockResolvedValue({
    projectMetadata: { defaultSkillIds: ["second"] },
    defaultSkills: [{ sId: "second", name: "Second", icon: null }],
  });
  clientFetch.mockResolvedValue(
    Response.json({ projectMetadata: { defaultSkillIds: ["second"] } })
  );
  await act(async () => {
    await result.current.update({ defaultSkillIds: ["second"] });
  });
  await waitFor(() =>
    expect(result.current.defaultSkills.map((skill) => skill.sId)).toEqual([
      "second",
    ])
  );
  expect(fetcherWithBody).not.toHaveBeenCalled();
});
