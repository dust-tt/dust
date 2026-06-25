import {
  planFileKey,
  useClosePlan,
} from "@app/hooks/conversations/usePlanFile";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockClientFetch = vi.fn();
vi.mock("@app/lib/egress/client", () => ({
  clientFetch: (...args: unknown[]) => mockClientFetch(...args),
}));

const mockSendNotification = vi.fn();
vi.mock("@app/hooks/useNotification", () => ({
  useSendNotification: () => mockSendNotification,
}));

const mockMutate = vi.fn();
vi.mock("swr", async (importOriginal) => ({
  ...(await importOriginal<typeof import("swr")>()),
  useSWRConfig: () => ({ mutate: mockMutate }),
}));

describe("useClosePlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes { content: null } to the cache without revalidating on a successful close", async () => {
    mockClientFetch.mockResolvedValue(new Response(null, { status: 200 }));

    const { result } = renderHook(() =>
      useClosePlan({ workspaceId: "w_test", conversationId: "c_test" })
    );

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.closePlan();
    });

    const key = planFileKey({
      workspaceId: "w_test",
      conversationId: "c_test",
    });
    expect(ok).toBe(true);
    expect(mockClientFetch).toHaveBeenCalledWith(key, { method: "DELETE" });
    // Authoritative local cache write, not a refetch: avoids racing a quick subsequent create.
    expect(mockMutate).toHaveBeenCalledWith(
      key,
      { content: null },
      { revalidate: false }
    );
  });

  it("does not touch the cache and notifies on a failed close", async () => {
    mockClientFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "nope" } }), {
        status: 500,
      })
    );

    const { result } = renderHook(() =>
      useClosePlan({ workspaceId: "w_test", conversationId: "c_test" })
    );

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.closePlan();
    });

    expect(ok).toBe(false);
    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockSendNotification).toHaveBeenCalled();
  });
});
