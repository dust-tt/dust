import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { LightUserFactory } from "@app/tests/utils/LightUserFactory";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clientFetch: vi.fn(),
  clearPendingFirstMessage: vi.fn(),
  fetcher: vi.fn(),
  resumeOngoingAgentLoopsPolling: vi.fn(),
  setPendingFirstMessage: vi.fn(),
}));

vi.mock(
  "@app/components/assistant/conversation/input_bar/InputBarContext",
  async () => {
    const { createContext } = await import("react");
    return {
      InputBarContext: createContext({
        clearPendingFirstMessage: mocks.clearPendingFirstMessage,
        setPendingFirstMessage: mocks.setPendingFirstMessage,
      }),
    };
  }
);

vi.mock("@app/hooks/useNotification", () => ({
  useSendNotification: () => vi.fn(),
}));

vi.mock("@app/lib/egress/client", () => ({
  clientFetch: mocks.clientFetch,
}));

vi.mock("@app/lib/swr/ongoing_agent_loops", () => ({
  useResumeOngoingAgentLoopsPolling: () => mocks.resumeOngoingAgentLoopsPolling,
}));

vi.mock("@app/lib/swr/swr", () => ({
  useFetcher: () => ({ fetcher: mocks.fetcher }),
}));

const owner = LightWorkspaceFactory.build({ sId: "w_1" });
const user = LightUserFactory.build({ sId: "u_1" });

describe("useCreateConversationWithMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetcher.mockResolvedValue({
      conversation: { sId: "conv_1" },
      contentFragments: [],
    });
    mocks.clientFetch.mockResolvedValue(new Response(null, { status: 200 }));
  });

  it("resumes active polling after creating a deferred conversation", async () => {
    const { result } = renderHook(() =>
      useCreateConversationWithMessage({ owner, user })
    );

    await act(async () => {
      await result.current({
        messageData: {
          input: "Hello",
          mentions: [],
          contentFragments: { uploaded: [], contentNodes: [] },
        },
        deferMessage: true,
      });
    });

    await waitFor(() => {
      expect(mocks.resumeOngoingAgentLoopsPolling).toHaveBeenCalledOnce();
    });
  });

  it("resumes active polling after creating a conversation with a message", async () => {
    const { result } = renderHook(() =>
      useCreateConversationWithMessage({ owner, user })
    );

    await act(async () => {
      await result.current({
        messageData: {
          input: "Hello",
          mentions: [],
          contentFragments: { uploaded: [], contentNodes: [] },
        },
      });
    });

    expect(mocks.resumeOngoingAgentLoopsPolling).toHaveBeenCalledOnce();
  });
});
