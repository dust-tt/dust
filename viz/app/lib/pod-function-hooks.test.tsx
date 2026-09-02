// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import {
  PodFunctionHooksProvider,
  usePodFunction,
  usePodFunctionMutation,
  useUserIdentity,
} from "@viz/app/lib/pod-function-hooks";
import type { VisualizationDataAPI } from "@viz/app/lib/visualization-api";
import { createElement, type PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

function makeDataAPI(
  callFunction: VisualizationDataAPI["callFunction"]
): VisualizationDataAPI {
  return {
    callFunction,
    fetchCode: vi.fn(),
    fetchFile: vi.fn(),
    getUserIdentity: vi.fn().mockResolvedValue({
      isAuthenticated: false,
      isWorkspaceMember: false,
      user: null,
    }),
  };
}

function makeWrapper(dataAPI: VisualizationDataAPI) {
  return function Wrapper({ children }: PropsWithChildren) {
    return createElement(PodFunctionHooksProvider, { dataAPI }, children);
  };
}

describe("useUserIdentity", () => {
  it("returns the user authenticated in the Frame workspace", async () => {
    const dataAPI = makeDataAPI(vi.fn());
    dataAPI.getUserIdentity = vi.fn().mockResolvedValue({
      isAuthenticated: true,
      isWorkspaceMember: true,
      isFrameAuthor: false,
      isPodEditor: false,
      isPodMember: false,
      user: {
        sId: "usr_123",
        firstName: "Ada",
        lastName: "Lovelace",
        fullName: "Ada Lovelace",
        image: null,
      },
    });

    const { result } = renderHook(() => useUserIdentity(), {
      wrapper: makeWrapper(dataAPI),
    });

    expect(result.current).toMatchObject({
      isAuthenticated: false,
      isWorkspaceMember: false,
      isFrameAuthor: false,
      isLoading: true,
      user: null,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({
      isAuthenticated: true,
      isWorkspaceMember: true,
      isFrameAuthor: false,
      user: { sId: "usr_123", fullName: "Ada Lovelace" },
    });
  });

  it("fails closed when identity cannot be loaded", async () => {
    const dataAPI = makeDataAPI(vi.fn());
    dataAPI.getUserIdentity = vi
      .fn()
      .mockRejectedValue(new Error("Frame host unavailable"));

    const { result } = renderHook(() => useUserIdentity(), {
      wrapper: makeWrapper(dataAPI),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({
      isAuthenticated: false,
      isWorkspaceMember: false,
      isFrameAuthor: false,
      user: null,
      error: new Error("Frame host unavailable"),
    });
  });
});

describe("usePodFunction", () => {
  it("calls a qualified slug and returns the direct function output", async () => {
    const callFunction = vi.fn().mockResolvedValue([{ id: 1, body: "Hello" }]);
    const dataAPI = makeDataAPI(callFunction);
    const { result } = renderHook(
      () => usePodFunction("vlt_123/list-comments", { threadId: "thread-1" }),
      { wrapper: makeWrapper(dataAPI) }
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isValidating).toBe(true);

    await waitFor(() => {
      expect(result.current.data).toEqual([{ id: 1, body: "Hello" }]);
    });
    expect(callFunction).toHaveBeenCalledWith("vlt_123/list-comments", {
      threadId: "thread-1",
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isValidating).toBe(false);

    window.dispatchEvent(new Event("focus"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(callFunction).toHaveBeenCalledTimes(1);
  });

  it("calls a slug carrying its app prefix", async () => {
    const callFunction = vi.fn().mockResolvedValue([{ id: 1, title: "Task" }]);
    const dataAPI = makeDataAPI(callFunction);
    const { result } = renderHook(
      () => usePodFunction("vlt_123/tasklist__list-tasks", { done: false }),
      { wrapper: makeWrapper(dataAPI) }
    );

    await waitFor(() => {
      expect(result.current.data).toEqual([{ id: 1, title: "Task" }]);
    });
    expect(result.current.error).toBeUndefined();
    expect(callFunction).toHaveBeenCalledWith("vlt_123/tasklist__list-tasks", {
      done: false,
    });
  });

  it("does not call the function when disabled", async () => {
    const callFunction = vi.fn();
    const { result } = renderHook(
      () => usePodFunction(null, { ignored: true }),
      {
        wrapper: makeWrapper(makeDataAPI(callFunction)),
      }
    );

    expect(result.current).toMatchObject({
      data: undefined,
      error: undefined,
      isLoading: false,
      isValidating: false,
    });
    await expect(result.current.mutate()).resolves.toBeUndefined();
    expect(callFunction).not.toHaveBeenCalled();
  });

  it("forwards a bare function name for the host to resolve", async () => {
    // A Frame inside an app folder names its own functions bare; the host qualifies it against that
    // folder. viz only decides the reference is well formed and passes it on.
    const callFunction = vi.fn().mockResolvedValue({ comments: [] });
    const { result } = renderHook(
      () => usePodFunction("list-comments", { threadId: "thread-1" }),
      { wrapper: makeWrapper(makeDataAPI(callFunction)) }
    );

    await waitFor(() => {
      expect(result.current.data).toEqual({ comments: [] });
    });
    expect(result.current.error).toBeUndefined();
    expect(callFunction).toHaveBeenCalledWith("list-comments", {
      threadId: "thread-1",
    });
  });

  it("rejects a reference that is neither form", () => {
    const callFunction = vi.fn();
    const { result } = renderHook(
      // Prefixed but pod-less: not shorthand, since dropping the prefix is what the bare form is for.
      () => usePodFunction("comments__list", { threadId: "thread-1" }),
      { wrapper: makeWrapper(makeDataAPI(callFunction)) }
    );

    expect(result.current.error).toEqual(
      new Error(
        "Pod Function hooks require a <podId>/<slug> reference, or a bare function name " +
          "from a Frame that lives in an app folder."
      )
    );
    expect(result.current.isLoading).toBe(false);
    expect(callFunction).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent calls with structurally identical inputs", async () => {
    const request = deferred<unknown>();
    const callFunction = vi.fn().mockReturnValue(request.promise);
    const { result } = renderHook(
      () => ({
        first: usePodFunction("vlt_123/list-comments", {
          filters: { author: "flavien", resolved: false },
        }),
        second: usePodFunction("vlt_123/list-comments", {
          filters: { resolved: false, author: "flavien" },
        }),
      }),
      { wrapper: makeWrapper(makeDataAPI(callFunction)) }
    );

    await waitFor(() => expect(callFunction).toHaveBeenCalledTimes(1));
    request.resolve([{ id: 1 }]);
    await waitFor(() => {
      expect(result.current.first.data).toEqual([{ id: 1 }]);
      expect(result.current.second.data).toEqual([{ id: 1 }]);
    });
  });

  it("keeps cached data visible while mutate revalidates", async () => {
    const revalidation = deferred<unknown>();
    const callFunction = vi
      .fn()
      .mockResolvedValueOnce([{ id: 1 }])
      .mockReturnValueOnce(revalidation.promise);
    const { result } = renderHook(
      () => usePodFunction("vlt_123/list-comments", { threadId: "thread-1" }),
      { wrapper: makeWrapper(makeDataAPI(callFunction)) }
    );

    await waitFor(() => expect(result.current.data).toEqual([{ id: 1 }]));

    let mutatePromise: Promise<unknown> | undefined;
    act(() => {
      mutatePromise = result.current.mutate();
    });
    await waitFor(() => expect(result.current.isValidating).toBe(true));
    expect(result.current.data).toEqual([{ id: 1 }]);

    revalidation.resolve([{ id: 1 }, { id: 2 }]);
    await act(async () => mutatePromise);
    expect(result.current.data).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.current.isValidating).toBe(false);
  });

  it("keeps previous data visible when the input changes", async () => {
    const nextRequest = deferred<unknown>();
    const callFunction = vi
      .fn()
      .mockResolvedValueOnce([{ id: 1 }])
      .mockReturnValueOnce(nextRequest.promise);
    const { result, rerender } = renderHook(
      ({ page }: { page: number }) =>
        usePodFunction("vlt_123/list-comments", { page }),
      {
        initialProps: { page: 1 },
        wrapper: makeWrapper(makeDataAPI(callFunction)),
      }
    );

    await waitFor(() => expect(result.current.data).toEqual([{ id: 1 }]));
    rerender({ page: 2 });

    await waitFor(() => expect(callFunction).toHaveBeenCalledTimes(2));
    expect(result.current.data).toEqual([{ id: 1 }]);
    expect(result.current.isValidating).toBe(true);

    nextRequest.resolve([{ id: 2 }]);
    await waitFor(() => expect(result.current.data).toEqual([{ id: 2 }]));
  });

  it("keeps mutate stable across rerenders", async () => {
    const callFunction = vi.fn().mockResolvedValue([]);
    const { result, rerender } = renderHook(
      ({ input }: { input: { page: number } }) =>
        usePodFunction("vlt_123/list-comments", input),
      {
        initialProps: { input: { page: 1 } },
        wrapper: makeWrapper(makeDataAPI(callFunction)),
      }
    );
    const mutate = result.current.mutate;

    rerender({ input: { page: 1 } });

    expect(result.current.mutate).toBe(mutate);
  });

  it("serves cached data without revalidating when a query remounts immediately", async () => {
    const callFunction = vi.fn().mockResolvedValue([{ id: 1 }]);
    const { result, rerender } = renderHook(
      ({ slug }: { slug: string | null }) =>
        usePodFunction(slug, { threadId: "thread-1" }),
      {
        initialProps: { slug: "vlt_123/list-comments" as string | null },
        wrapper: makeWrapper(makeDataAPI(callFunction)),
      }
    );

    await waitFor(() => expect(result.current.data).toEqual([{ id: 1 }]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    rerender({ slug: null });
    rerender({ slug: "vlt_123/list-comments" });

    expect(result.current.data).toEqual([{ id: 1 }]);
    expect(result.current.isValidating).toBe(false);
    expect(callFunction).toHaveBeenCalledTimes(1);
  });

  it("normalizes function failures without retrying", async () => {
    const callFunction = vi.fn().mockRejectedValue({
      code: "http_error",
      message: "Function returned HTTP 503.",
      status: 503,
    });
    const { result } = renderHook(
      () => usePodFunction("vlt_123/list-comments", { threadId: "thread-1" }),
      { wrapper: makeWrapper(makeDataAPI(callFunction)) }
    );

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.error).toMatchObject({
      code: "http_error",
      message: "Function returned HTTP 503.",
      status: 503,
    });
    expect(callFunction).toHaveBeenCalledTimes(1);
  });

  it("isolates identical cache keys between Frame providers", async () => {
    const firstCall = vi.fn().mockResolvedValue([{ frame: 1 }]);
    const secondCall = vi.fn().mockResolvedValue([{ frame: 2 }]);
    const first = renderHook(
      () => usePodFunction("vlt_123/list-comments", { threadId: "same" }),
      { wrapper: makeWrapper(makeDataAPI(firstCall)) }
    );
    const second = renderHook(
      () => usePodFunction("vlt_123/list-comments", { threadId: "same" }),
      { wrapper: makeWrapper(makeDataAPI(secondCall)) }
    );

    await waitFor(() =>
      expect(first.result.current.data).toEqual([{ frame: 1 }])
    );
    await waitFor(() =>
      expect(second.result.current.data).toEqual([{ frame: 2 }])
    );
    expect(firstCall).toHaveBeenCalledTimes(1);
    expect(secondCall).toHaveBeenCalledTimes(1);
  });
});

describe("usePodFunctionMutation", () => {
  it("runs only when triggered and does not deduplicate writes", async () => {
    const firstRequest = deferred<unknown>();
    const secondRequest = deferred<unknown>();
    const callFunction = vi
      .fn()
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);
    const { result } = renderHook(
      () => usePodFunctionMutation("vlt_123/post-comment"),
      { wrapper: makeWrapper(makeDataAPI(callFunction)) }
    );

    expect(callFunction).not.toHaveBeenCalled();

    let firstPromise: Promise<unknown> | undefined;
    let secondPromise: Promise<unknown> | undefined;
    act(() => {
      firstPromise = result.current.trigger({ body: "First" });
      secondPromise = result.current.trigger({ body: "Second" });
    });
    expect(callFunction).toHaveBeenCalledTimes(2);
    expect(callFunction).toHaveBeenNthCalledWith(1, "vlt_123/post-comment", {
      body: "First",
    });
    expect(callFunction).toHaveBeenNthCalledWith(2, "vlt_123/post-comment", {
      body: "Second",
    });

    firstRequest.resolve({ id: 1 });
    secondRequest.resolve({ id: 2 });
    await act(async () => {
      await firstPromise;
      await secondPromise;
    });
    expect(result.current.data).toEqual({ id: 2 });
  });

  it("normalizes mutation errors", async () => {
    const callFunction = vi.fn().mockRejectedValue(new Error("Write failed"));
    const { result } = renderHook(
      () => usePodFunctionMutation("vlt_123/post-comment"),
      { wrapper: makeWrapper(makeDataAPI(callFunction)) }
    );

    await act(async () => {
      await expect(result.current.trigger({ body: "Hello" })).rejects.toThrow(
        "Write failed"
      );
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("Write failed");
  });

  it("clears stale mutation state when the function changes", async () => {
    const firstRequest = deferred<unknown>();
    const callFunction = vi
      .fn()
      .mockReturnValueOnce(firstRequest.promise)
      .mockResolvedValueOnce({ id: 2 });
    const { result, rerender } = renderHook(
      ({ slug }: { slug: string }) => usePodFunctionMutation(slug),
      {
        initialProps: { slug: "vlt_123/first-comment" },
        wrapper: makeWrapper(makeDataAPI(callFunction)),
      }
    );

    let firstPromise: Promise<unknown> | undefined;
    act(() => {
      firstPromise = result.current.trigger({ body: "First" });
    });
    rerender({ slug: "vlt_123/second-comment" });
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeUndefined();

    firstRequest.resolve({ id: 1 });
    await act(async () => firstPromise);
    expect(result.current.data).toBeUndefined();

    await act(async () => {
      await result.current.trigger({ body: "Second" });
    });
    expect(result.current.data).toEqual({ id: 2 });
  });

  it("keeps trigger stable and rejects disabled mutations", async () => {
    const callFunction = vi.fn();
    const { result, rerender } = renderHook(
      ({ slug }: { slug: string | null }) => usePodFunctionMutation(slug),
      {
        initialProps: { slug: "vlt_123/post-comment" as string | null },
        wrapper: makeWrapper(makeDataAPI(callFunction)),
      }
    );
    const trigger = result.current.trigger;

    rerender({ slug: "vlt_123/post-comment" });
    expect(result.current.trigger).toBe(trigger);

    rerender({ slug: null });
    await expect(result.current.trigger({ body: "Ignored" })).rejects.toThrow(
      "Cannot trigger a disabled Pod Function mutation."
    );
    expect(callFunction).not.toHaveBeenCalled();
  });

  it("updates query data from a mutation result without revalidating", async () => {
    const callFunction = vi.fn(async (functionId: string) => {
      if (functionId.endsWith("/post-comment")) {
        return [{ id: 1 }, { id: 2 }];
      }
      return [{ id: 1 }];
    });
    const { result } = renderHook(
      () => ({
        list: usePodFunction("vlt_123/list-comments", {
          threadId: "thread-1",
        }),
        post: usePodFunctionMutation("vlt_123/post-comment"),
      }),
      { wrapper: makeWrapper(makeDataAPI(callFunction)) }
    );

    await waitFor(() => expect(result.current.list.data).toEqual([{ id: 1 }]));
    await act(async () => {
      const updatedComments = await result.current.post.trigger({
        threadId: "thread-1",
        body: "Second",
      });
      await result.current.list.mutate(updatedComments, {
        revalidate: false,
      });
    });
    expect(result.current.list.data).toEqual([{ id: 1 }, { id: 2 }]);
    expect(callFunction).toHaveBeenCalledTimes(2);
  });
});
