import {
  useOngoingAgentLoops,
  useResumeOngoingAgentLoopsPolling,
} from "@app/lib/swr/ongoing_agent_loops";
import type { GetOngoingAgentLoopsResponseBody } from "@app/types/api/assistant/conversation/types";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type OngoingAgentLoopsSWRData = GetOngoingAgentLoopsResponseBody & {
  pendingAgentLoopStart?: true;
};

type CacheUpdater = (
  current: OngoingAgentLoopsSWRData | undefined
) => OngoingAgentLoopsSWRData | undefined;

type GlobalMutate = (
  key: string,
  updateCache: CacheUpdater,
  options: { revalidate: false }
) => Promise<unknown>;

type LocalMutate = () => Promise<unknown>;

type UseSWRWithDefaults = (
  key: string,
  fetcher: unknown,
  config: {
    refreshInterval: (latest: OngoingAgentLoopsSWRData | undefined) => number;
  }
) => {
  data: OngoingAgentLoopsSWRData | undefined;
  error: unknown;
  isLoading: boolean;
  mutate: LocalMutate;
};

const mocks = vi.hoisted(() => ({
  mutate: vi.fn<LocalMutate>(),
  globalMutate: vi.fn<GlobalMutate>(),
  useSWRWithDefaults: vi.fn<UseSWRWithDefaults>(),
}));

vi.mock("swr", () => ({
  useSWRConfig: () => ({ mutate: mocks.globalMutate }),
}));

vi.mock("@app/lib/swr/swr", () => ({
  emptyArray: () => [],
  useFetcher: () => ({ fetcher: vi.fn() }),
  useSWRWithDefaults: mocks.useSWRWithDefaults,
}));

describe("useOngoingAgentLoops", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mutate.mockResolvedValue(undefined);
    mocks.globalMutate.mockResolvedValue(undefined);
    mocks.useSWRWithDefaults.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
      mutate: mocks.mutate,
    });
  });

  it("polls frequently only while agent loops are active", () => {
    renderHook(() =>
      useOngoingAgentLoops({ workspaceId: "w_1", onSuccess: vi.fn() })
    );

    const firstCall = mocks.useSWRWithDefaults.mock.calls.at(0);
    if (!firstCall) {
      throw new Error("Expected useSWRWithDefaults to be called.");
    }
    const config = firstCall[2];

    expect(config.refreshInterval(undefined)).toBe(120_000);
    expect(config.refreshInterval({ agentLoops: [] })).toBe(120_000);
    expect(
      config.refreshInterval({ agentLoops: [], pendingAgentLoopStart: true })
    ).toBe(10_000);
    expect(
      config.refreshInterval({
        agentLoops: [{ conversationId: "conv_1", messageId: "msg_1" }],
      })
    ).toBe(10_000);
  });

  it("refreshes the registry when a visible page regains focus", () => {
    let visibilityState: DocumentVisibilityState = "hidden";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => visibilityState
    );
    let now = 10_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const { unmount } = renderHook(() =>
      useOngoingAgentLoops({ workspaceId: "w_1", onSuccess: vi.fn() })
    );

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(mocks.mutate).not.toHaveBeenCalled();

    visibilityState = "visible";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(mocks.mutate).toHaveBeenCalledOnce();

    unmount();
    now += 1_000;
    window.dispatchEvent(new Event("focus"));
    expect(mocks.mutate).toHaveBeenCalledOnce();
  });

  it("resumes active polling without revalidating", () => {
    const { result } = renderHook(() =>
      useResumeOngoingAgentLoopsPolling("w_1")
    );

    act(() => {
      result.current();
    });

    expect(mocks.globalMutate).toHaveBeenCalledWith(
      "/api/w/w_1/assistant/ongoing-agent-loops",
      expect.any(Function),
      { revalidate: false }
    );

    const firstCall = mocks.globalMutate.mock.calls.at(0);
    if (!firstCall) {
      throw new Error("Expected global mutate to be called.");
    }
    const updateCache = firstCall[1];

    expect(
      updateCache({
        agentLoops: [{ conversationId: "conv_2", messageId: "msg_existing" }],
      })
    ).toEqual({
      agentLoops: [{ conversationId: "conv_2", messageId: "msg_existing" }],
      pendingAgentLoopStart: true,
    });
    expect(updateCache(undefined)).toEqual({
      agentLoops: [],
      pendingAgentLoopStart: true,
    });
  });
});
