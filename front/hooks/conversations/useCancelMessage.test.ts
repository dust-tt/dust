import { useCancelMessage } from "@app/hooks/conversations/useCancelMessage";
import type { LightWorkspaceType } from "@app/types/user";
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

const owner = { sId: "w_test" } as LightWorkspaceType;

async function cancel({
  conversationId = "c_test",
  messageIds = ["m_1"],
}: { conversationId?: string | null; messageIds?: string[] } = {}) {
  const { result } = renderHook(() =>
    useCancelMessage({ owner, conversationId })
  );
  let ok: boolean | undefined;
  await act(async () => {
    ok = await result.current(messageIds, "interrupt");
  });
  return ok;
}

describe("useCancelMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves to true and does not notify when the request succeeds", async () => {
    mockClientFetch.mockResolvedValue(new Response(null, { status: 200 }));

    expect(await cancel()).toBe(true);
    expect(mockClientFetch).toHaveBeenCalledWith(
      "/api/w/w_test/assistant/conversations/c_test/cancel",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "interrupt", messageIds: ["m_1"] }),
      })
    );
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("resolves to false and notifies on a non-2xx response", async () => {
    mockClientFetch.mockResolvedValue(new Response(null, { status: 500 }));

    expect(await cancel()).toBe(false);
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" })
    );
  });

  it("resolves to false and notifies on a network error", async () => {
    mockClientFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await cancel()).toBe(false);
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" })
    );
  });

  it("resolves to false without a request when there is nothing to cancel", async () => {
    expect(await cancel({ messageIds: [] })).toBe(false);
    expect(await cancel({ conversationId: null })).toBe(false);
    expect(mockClientFetch).not.toHaveBeenCalled();
    expect(mockSendNotification).not.toHaveBeenCalled();
  });
});
