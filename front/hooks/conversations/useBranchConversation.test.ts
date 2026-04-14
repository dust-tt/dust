import type { LightWorkspaceType } from "@app/types/user";
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useBranchConversation } from "./useBranchConversation";

const clientFetchMock = vi.fn();
const getConversationRouteMock = vi.fn();
const getErrorFromResponseMock = vi.fn();
const mutateConversationsMock = vi.fn();
const pushMock = vi.fn();
const sendNotificationMock = vi.fn();

vi.mock("@app/hooks/conversations/useConversations", () => ({
  useConversations: () => ({
    mutateConversations: mutateConversationsMock,
  }),
}));

vi.mock("@app/hooks/useNotification", () => ({
  useSendNotification: () => sendNotificationMock,
}));

vi.mock("@app/lib/egress/client", () => ({
  clientFetch: (...args: unknown[]) => clientFetchMock(...args),
}));

vi.mock("@app/lib/platform", () => ({
  useAppRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("@app/lib/swr/swr", () => ({
  getErrorFromResponse: (...args: unknown[]) =>
    getErrorFromResponseMock(...args),
}));

vi.mock("@app/lib/utils/router", () => ({
  getConversationRoute: (...args: unknown[]) =>
    getConversationRouteMock(...args),
}));

describe("useBranchConversation", () => {
  const owner = { sId: "ws_123" } as LightWorkspaceType;

  beforeEach(() => {
    clientFetchMock.mockReset();
    getConversationRouteMock.mockReset();
    getErrorFromResponseMock.mockReset();
    mutateConversationsMock.mockReset();
    pushMock.mockReset();
    sendNotificationMock.mockReset();

    getConversationRouteMock.mockReturnValue("/w/ws_123/assistant/child_123");
    pushMock.mockResolvedValue(true);
    clientFetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        conversation: {
          sId: "child_123",
          spaceId: null,
        },
      }),
    });
  });

  it("sends an empty body when branching from the latest agent message", async () => {
    const { result } = renderHook(() =>
      useBranchConversation({
        owner,
        conversationId: "conv_123",
      })
    );

    await act(async () => {
      await result.current.branchConversation();
    });

    expect(clientFetchMock).toHaveBeenCalledWith(
      "/api/w/ws_123/assistant/conversations/conv_123/forks",
      expect.objectContaining({
        body: JSON.stringify({}),
      })
    );
  });

  it("sends the selected source message id when branching from a message", async () => {
    const { result } = renderHook(() =>
      useBranchConversation({
        owner,
        conversationId: "conv_123",
      })
    );

    await act(async () => {
      await result.current.branchConversation("msg_123");
    });

    expect(clientFetchMock).toHaveBeenCalledWith(
      "/api/w/ws_123/assistant/conversations/conv_123/forks",
      expect.objectContaining({
        body: JSON.stringify({ sourceMessageId: "msg_123" }),
      })
    );
    expect(pushMock).toHaveBeenCalledWith(
      "/w/ws_123/assistant/child_123",
      undefined,
      { shallow: true }
    );
    expect(mutateConversationsMock).toHaveBeenCalledTimes(1);
  });
});
