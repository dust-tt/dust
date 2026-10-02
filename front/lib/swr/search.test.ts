import { useUnifiedSearch } from "@app/lib/swr/search";
import type { LightWorkspaceType } from "@app/types/user";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { clientFetch } = vi.hoisted(() => ({ clientFetch: vi.fn() }));
vi.mock("@app/lib/egress/client", () => ({ clientFetch }));
vi.mock("@app/lib/swr/pods", () => ({
  usePodFiles: () => ({ files: [], isPodFilesLoading: false }),
}));

const owner: LightWorkspaceType = {
  id: 1,
  sId: "w_test",
  name: "Test",
  role: "admin",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  regionalModelsOnly: false,
  sharingPolicy: "workspace_only",
  locale: "en-US",
  metronomeCustomerId: null,
};
const response = (nextPageCursor: string | null) =>
  Response.json({
    knowledgeResults: {
      nodes: [],
      warningCode: null,
      nextPageCursor,
      resultsCount: 0,
    },
    toolResults: [],
  });

beforeEach(() => clientFetch.mockReset());

describe("conversation search requests", () => {
  it("ignores a late response from the previous query and aborts it", async () => {
    const first = Promise.withResolvers<Response>();
    const second = Promise.withResolvers<Response>();
    clientFetch
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result, rerender, unmount } = renderHook(
      ({ query }) => useUnifiedSearch({ owner, query }),
      { initialProps: { query: "first" } }
    );
    const firstSignal = clientFetch.mock.calls[0][1].signal;
    rerender({ query: "second" });
    expect(firstSignal.aborted).toBe(true);
    await act(async () => {
      second.resolve(response("new-cursor"));
    });
    expect(result.current.hasMore).toBe(true);
    await act(async () => {
      first.resolve(response(null));
    });
    expect(result.current.hasMore).toBe(true);
    expect(result.current.isSearchError).toBeNull();
    expect(result.current.isSearchLoading).toBe(false);
    expect(clientFetch.mock.calls[0][1].headers).toEqual({
      Accept: "application/json",
    });
    unmount();
  });

  it("serializes pagination and cancels pending work when disabled", async () => {
    clientFetch.mockResolvedValueOnce(response("next"));
    const pending = Promise.withResolvers<Response>();
    clientFetch.mockReturnValueOnce(pending.promise);
    const { result, rerender, unmount } = renderHook(
      ({ disabled }) => useUnifiedSearch({ owner, query: "files", disabled }),
      { initialProps: { disabled: false } }
    );
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    act(() => {
      void result.current.nextPage();
      void result.current.nextPage();
    });
    expect(clientFetch).toHaveBeenCalledTimes(2);
    const signal = clientFetch.mock.calls[1][1].signal;
    rerender({ disabled: true });
    expect(signal.aborted).toBe(true);
    expect(result.current.isSearchValidating).toBe(false);
    await act(async () => {
      pending.resolve(response("stale"));
    });
    expect(result.current.hasMore).toBe(false);
    unmount();
  });
  it("clears loading flags after a rejected search and retries a new query", async () => {
    clientFetch.mockRejectedValueOnce(new Error("offline"));
    const { result, rerender } = renderHook(
      ({ query }) => useUnifiedSearch({ owner, query }),
      { initialProps: { query: "first" } }
    );
    await waitFor(() =>
      expect(result.current.isSearchError?.message).toBe("offline")
    );
    expect(result.current.isSearchLoading).toBe(false);
    expect(result.current.isSearchValidating).toBe(false);
    clientFetch.mockResolvedValueOnce(response(null));
    rerender({ query: "second" });
    await waitFor(() => expect(result.current.isSearchLoading).toBe(false));
    expect(result.current.isSearchError).toBeNull();
  });
});
