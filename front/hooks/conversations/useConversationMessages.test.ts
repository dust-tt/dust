import type { OngoingAgentLoopsSnapshot } from "@app/components/assistant/conversation/AgentLoopStreamContext";
import { useOngoingAgentLoopsSnapshot } from "@app/components/assistant/conversation/AgentLoopStreamContext";
import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import { makeInitialMessageStreamState } from "@app/components/assistant/conversation/types";
import { useConversationMessages } from "@app/hooks/conversations/useConversationMessages";
import { useSWRInfiniteWithDefaults } from "@app/lib/swr/swr";
import {
  mockAgentMessage,
  mockUserMessage,
} from "@app/tests/utils/conversation_test_factories";
import type { AgentMessageStatus } from "@app/types/assistant/conversation";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/logger/datadogLogger", () => ({ default: { error: vi.fn() } }));

vi.mock(
  "@app/components/assistant/conversation/AgentLoopStreamContext",
  () => ({
    useOngoingAgentLoopsSnapshot: vi.fn(),
  })
);
vi.mock("@app/lib/swr/swr", () => ({
  useFetcher: () => ({ fetcher: vi.fn() }),
  useSWRInfiniteWithDefaults: vi.fn(),
}));

type RecoveryParams = Parameters<typeof useConversationMessages>[0] & {
  isLoadingInitialData: boolean;
  isValidating: boolean;
  isMessagesError: boolean;
  ongoingLoopsSnapshot: OngoingAgentLoopsSnapshot | null;
  mutateMessages: () => Promise<undefined>;
};

function useMessagesWithSnapshot({
  isLoadingInitialData,
  isValidating,
  isMessagesError,
  ongoingLoopsSnapshot,
  mutateMessages,
  ...params
}: RecoveryParams) {
  vi.mocked(useOngoingAgentLoopsSnapshot).mockReturnValue(ongoingLoopsSnapshot);
  vi.mocked(useSWRInfiniteWithDefaults).mockReturnValue({
    data: isLoadingInitialData ? undefined : [],
    error: isMessagesError ? new Error("offline") : undefined,
    mutate: mutateMessages,
    size: 1,
    setSize: vi.fn(),
    isLoading: isLoadingInitialData,
    isValidating,
  });
  return useConversationMessages(params);
}

function makeMessage(sId: string, status: AgentMessageStatus = "created") {
  return makeInitialMessageStreamState({
    ...mockAgentMessage({ content: null }),
    sId,
    status,
  });
}

function makeSnapshot(messageIds: string[]): OngoingAgentLoopsSnapshot {
  return {
    workspaceId: "w_1",
    agentLoops: messageIds.map((messageId) => ({
      conversationId: "conv_1",
      messageId,
    })),
  };
}

function setupRecovery(
  localMessages: VirtuosoMessage[],
  registryIds: string[]
) {
  const getMessages = vi.fn(() => localMessages);
  const mutateMessages = vi.fn().mockResolvedValue(undefined);
  const params: RecoveryParams = {
    conversationId: "conv_1",
    workspaceId: "w_1",
    limit: 50,
    disabled: false,
    isLoadingInitialData: false,
    isValidating: false,
    isMessagesError: false,
    ongoingLoopsSnapshot: makeSnapshot(registryIds),
    messageListRef: { current: { data: { get: getMessages } } },
    mutateMessages,
  };
  return { params, getMessages, mutateMessages };
}

describe("useConversationMessages registry recovery", () => {
  it.each([
    { localIds: ["msg_1"], registryIds: [] },
    { localIds: [], registryIds: ["msg_1"] },
    { localIds: ["msg_1"], registryIds: ["msg_2"] },
  ])(
    "revalidates when local $localIds disagree with registry $registryIds",
    ({ localIds, registryIds }) => {
      const { params, mutateMessages } = setupRecovery(
        localIds.map((id) => makeMessage(id)),
        registryIds
      );

      renderHook(useMessagesWithSnapshot, { initialProps: params });

      expect(mutateMessages).toHaveBeenCalledTimes(1);
    }
  );

  it("allows a later registry response to retry a failed refresh", async () => {
    const { params, mutateMessages } = setupRecovery(
      [makeMessage("msg_1")],
      []
    );
    mutateMessages.mockRejectedValueOnce(new Error("offline"));
    const { rerender } = renderHook(useMessagesWithSnapshot, {
      initialProps: params,
    });
    await waitFor(() => expect(mutateMessages).toHaveBeenCalledOnce());
    await Promise.resolve();
    rerender({ ...params, ongoingLoopsSnapshot: makeSnapshot([]) });
    expect(mutateMessages).toHaveBeenCalledTimes(2);
  });

  it("deduplicates a persistent mismatch and allows recovery again after agreement", () => {
    const { params, getMessages, mutateMessages } = setupRecovery(
      [makeMessage("msg_1")],
      []
    );
    const { rerender } = renderHook(useMessagesWithSnapshot, {
      initialProps: params,
    });
    expect(mutateMessages).toHaveBeenCalledTimes(1);

    rerender({ ...params, ongoingLoopsSnapshot: makeSnapshot([]) });
    expect(mutateMessages).toHaveBeenCalledTimes(1);

    getMessages.mockReturnValue([makeMessage("msg_2")]);
    rerender({ ...params, ongoingLoopsSnapshot: makeSnapshot([]) });
    expect(mutateMessages).toHaveBeenCalledTimes(2);

    rerender({ ...params, ongoingLoopsSnapshot: makeSnapshot(["msg_2"]) });
    expect(mutateMessages).toHaveBeenCalledTimes(2);
    rerender({ ...params, ongoingLoopsSnapshot: makeSnapshot([]) });
    expect(mutateMessages).toHaveBeenCalledTimes(3);
  });

  it("compares only persisted streaming agents in this conversation, regardless of order", () => {
    const { params, mutateMessages } = setupRecovery(
      [
        makeMessage("msg_2"),
        makeMessage("placeholder-agent-message-1"),
        makeMessage("msg_done", "succeeded"),
        mockUserMessage("Hello"),
        makeMessage("msg_1"),
      ],
      ["msg_1", "msg_2"]
    );
    const snapshot = makeSnapshot(["msg_1", "msg_2"]);
    snapshot.agentLoops.push({
      conversationId: "conv_other",
      messageId: "msg_other",
    });

    renderHook(useMessagesWithSnapshot, {
      initialProps: { ...params, ongoingLoopsSnapshot: snapshot },
    });

    expect(mutateMessages).not.toHaveBeenCalled();
  });

  it.each<{ reason: string; overrides: Partial<RecoveryParams> }>([
    { reason: "disabled", overrides: { disabled: true } },
    {
      reason: "no mounted list supplied",
      overrides: { messageListRef: undefined },
    },
    {
      reason: "conversation unavailable",
      overrides: { conversationId: undefined },
    },
    { reason: "initial loading", overrides: { isLoadingInitialData: true } },
    { reason: "revalidation in progress", overrides: { isValidating: true } },
    { reason: "message fetch failed", overrides: { isMessagesError: true } },
    {
      reason: "no successful registry response",
      overrides: { ongoingLoopsSnapshot: null },
    },
    {
      reason: "registry belongs to another workspace",
      overrides: {
        ongoingLoopsSnapshot: { workspaceId: "w_other", agentLoops: [] },
      },
    },
    {
      reason: "list unavailable",
      overrides: { messageListRef: { current: null } },
    },
  ])("waits while $reason, then recovers when ready", ({ overrides }) => {
    const { params, mutateMessages } = setupRecovery(
      [makeMessage("msg_1")],
      []
    );
    const { rerender } = renderHook(useMessagesWithSnapshot, {
      initialProps: { ...params, ...overrides },
    });
    expect(mutateMessages).not.toHaveBeenCalled();

    rerender(params);
    expect(mutateMessages).toHaveBeenCalledTimes(1);
  });
});
