import type { ToolSearchResult } from "@app/lib/search/tools/types";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import { fetcher, fetcherWithBody } from "@app/lib/swr/fetcher";
import { useUnifiedSearch } from "@app/lib/swr/search";
import { makeContentNodeFixture } from "@app/tests/utils/content_node_test_fixtures";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement, StrictMode, useMemo } from "react";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { clientFetch } = vi.hoisted(() => ({ clientFetch: vi.fn() }));
vi.mock("@app/lib/egress/client", () => ({ clientFetch }));
vi.mock("@app/lib/swr/pods", () => ({
  usePodFiles: () => ({ files: [], isPodFilesLoading: false }),
}));

const owner = LightWorkspaceFactory.build({ sId: "w_test" });
let cache = new Map();

interface WrapperProps {
  children: ReactNode;
}

function Wrapper({ children }: WrapperProps) {
  const value = useMemo(() => ({ provider: () => cache }), []);
  return createElement(
    SWRConfig,
    { value },
    createElement(FetcherProvider, { fetcher, fetcherWithBody, children })
  );
}

const response = (
  nextPageCursor: string | null,
  nodeIds: string[] = [],
  toolResults: ToolSearchResult[] = []
) =>
  Response.json({
    knowledgeResults: {
      nodes: nodeIds.map((id) => {
        const node = makeContentNodeFixture(id);
        return {
          ...node,
          dataSource: node.dataSourceView.dataSource,
          dataSourceViews: [node.dataSourceView],
        };
      }),
      warningCode: null,
      nextPageCursor,
      resultsCount: 0,
    },
    toolResults,
  });

beforeEach(() => {
  clientFetch.mockReset();
  cache = new Map();
});

describe("conversation search requests", () => {
  it("ignores a late response from the previous query and aborts it", async () => {
    const first = Promise.withResolvers<Response>();
    const second = Promise.withResolvers<Response>();
    clientFetch
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result, rerender, unmount } = renderHook(
      ({ query }) => useUnifiedSearch({ owner, query }),
      { wrapper: Wrapper, initialProps: { query: "first" } }
    );
    const firstSignal = clientFetch.mock.calls[0][1].signal;
    rerender({ query: "second" });
    await waitFor(() => expect(firstSignal.aborted).toBe(true));
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
    expect(clientFetch.mock.calls[0][1].headers).toMatchObject({
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
      { wrapper: Wrapper, initialProps: { disabled: false } }
    );
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    act(() => {
      void result.current.nextPage();
      void result.current.nextPage();
    });
    expect(clientFetch).toHaveBeenCalledTimes(2);
    const signal = clientFetch.mock.calls[1][1].signal;
    rerender({ disabled: true });
    await waitFor(() => expect(signal.aborted).toBe(true));
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
      { wrapper: Wrapper, initialProps: { query: "first" } }
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
  it("clears loading flags after an HTTP error", async () => {
    clientFetch.mockResolvedValueOnce(
      new Response("Search unavailable", { status: 503 })
    );
    const { result } = renderHook(
      () => useUnifiedSearch({ owner, query: "files" }),
      { wrapper: Wrapper }
    );
    await waitFor(() =>
      expect(result.current.isSearchError?.message).toBe("Search unavailable")
    );
    expect(result.current.isSearchLoading).toBe(false);
    expect(result.current.isLoadingNextPage).toBe(false);
    expect(result.current.isSearchValidating).toBe(false);
  });

  it("aborts pending work on unmount and starts a fresh request on remount", async () => {
    const first = Promise.withResolvers<Response>();
    const second = Promise.withResolvers<Response>();
    clientFetch
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const mounted = renderHook(
      () => useUnifiedSearch({ owner, query: "files" }),
      { wrapper: Wrapper }
    );
    const signal = clientFetch.mock.calls[0][1].signal;
    mounted.unmount();
    await waitFor(() => expect(signal.aborted).toBe(true));

    const remounted = renderHook(
      () => useUnifiedSearch({ owner, query: "files" }),
      { wrapper: Wrapper }
    );
    await waitFor(() => expect(clientFetch).toHaveBeenCalledTimes(2));
    await act(async () => second.resolve(response("new-cursor")));
    await waitFor(() => expect(remounted.result.current.hasMore).toBe(true));
    await act(async () => first.resolve(response(null)));
    expect(remounted.result.current.hasMore).toBe(true);
    expect(remounted.result.current.isSearchError).toBeNull();
  });

  it("keeps a shared request alive while another consumer still needs it", async () => {
    const pending = Promise.withResolvers<Response>();
    clientFetch.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(
      ({ firstDisabled }) => ({
        first: useUnifiedSearch({
          owner,
          query: "shared",
          disabled: firstDisabled,
        }),
        second: useUnifiedSearch({ owner, query: "shared" }),
      }),
      { wrapper: Wrapper, initialProps: { firstDisabled: false } }
    );
    expect(clientFetch).toHaveBeenCalledTimes(1);
    const signal = clientFetch.mock.calls[0][1].signal;
    rerender({ firstDisabled: true });
    expect(signal.aborted).toBe(false);
    await act(async () => pending.resolve(response("next")));
    await waitFor(() => expect(result.current.second.hasMore).toBe(true));
    expect(result.current.second.isSearchError).toBeNull();
    expect(result.current.first.hasMore).toBe(false);
  });
  it("restarts the same query after disabling without reusing its aborted request", async () => {
    const first = Promise.withResolvers<Response>();
    const second = Promise.withResolvers<Response>();
    clientFetch
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(
      ({ disabled }) => useUnifiedSearch({ owner, query: "files", disabled }),
      { wrapper: Wrapper, initialProps: { disabled: false } }
    );
    const signal = clientFetch.mock.calls[0][1].signal;
    rerender({ disabled: true });
    await waitFor(() => expect(signal.aborted).toBe(true));
    rerender({ disabled: false });
    await waitFor(() => expect(clientFetch).toHaveBeenCalledTimes(2));
    await act(async () => second.resolve(response("new-cursor")));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => first.resolve(response(null)));
    expect(result.current.hasMore).toBe(true);
    expect(result.current.isSearchError).toBeNull();
  });
  it("appends knowledge pages without refetching tools or the first page", async () => {
    const tool: ToolSearchResult = {
      externalId: "tool-file",
      title: "Tool file",
      mimeType: "text/plain",
      type: "document",
      sourceUrl: null,
      serverViewId: "server",
      serverName: "Search tool",
      serverIcon: "ActionListIcon",
    };
    clientFetch
      .mockResolvedValueOnce(response("next", ["first"], [tool]))
      .mockResolvedValueOnce(response(null, ["second"]));
    const { result } = renderHook(
      () => useUnifiedSearch({ owner, query: "files" }),
      { wrapper: Wrapper }
    );
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => result.current.nextPage());
    expect(clientFetch).toHaveBeenCalledTimes(2);
    const pageUrl = new URL(clientFetch.mock.calls[1][0], "https://dust.tt");
    expect(pageUrl.searchParams.get("cursor")).toBe("next");
    expect(pageUrl.searchParams.get("includeTools")).toBe("false");
    expect(
      result.current.knowledgeResults.map((node) => node.internalId)
    ).toEqual(["first", "second"]);
    expect(result.current.toolResults).toEqual([tool]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.isLoadingNextPage).toBe(false);
  });

  it("keeps the request alive during StrictMode effect replay", async () => {
    const pending = Promise.withResolvers<Response>();
    clientFetch.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(
      () => useUnifiedSearch({ owner, query: "files" }),
      {
        wrapper: ({ children }) =>
          createElement(StrictMode, null, createElement(Wrapper, { children })),
      }
    );
    await act(async () => pending.resolve(response("next")));
    expect(clientFetch).toHaveBeenCalledTimes(1);
    expect(clientFetch.mock.calls[0][1].signal.aborted).toBe(false);
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    expect(result.current.isSearchError).toBeNull();
  });

  it("keeps pagination cancellation separate for searches with different tool settings", async () => {
    const firstPage = Promise.withResolvers<Response>();
    const secondPage = Promise.withResolvers<Response>();
    clientFetch
      .mockResolvedValueOnce(response("next"))
      .mockResolvedValueOnce(response("next"))
      .mockReturnValueOnce(firstPage.promise)
      .mockReturnValueOnce(secondPage.promise);
    const { result, rerender } = renderHook(
      ({ disabled }) => ({
        withTools: useUnifiedSearch({ owner, query: "files", disabled }),
        withoutTools: useUnifiedSearch({
          owner,
          query: "files",
          includeTools: false,
        }),
      }),
      { wrapper: Wrapper, initialProps: { disabled: false } }
    );
    await waitFor(() => {
      expect(result.current.withTools.hasMore).toBe(true);
      expect(result.current.withoutTools.hasMore).toBe(true);
    });
    act(() => {
      void result.current.withTools.nextPage();
      void result.current.withoutTools.nextPage();
    });
    expect(clientFetch).toHaveBeenCalledTimes(4);
    const withToolsSignal = clientFetch.mock.calls[2][1].signal;
    const withoutToolsSignal = clientFetch.mock.calls[3][1].signal;
    rerender({ disabled: true });
    await waitFor(() => expect(withToolsSignal.aborted).toBe(true));
    expect(withoutToolsSignal.aborted).toBe(false);
    await act(async () => {
      firstPage.resolve(response(null, ["stale"]));
      secondPage.resolve(response(null, ["current"]));
    });
    expect(
      result.current.withoutTools.knowledgeResults.map(
        (node) => node.internalId
      )
    ).toEqual(["current"]);
    expect(result.current.withoutTools.isSearchError).toBeNull();
  });
});
