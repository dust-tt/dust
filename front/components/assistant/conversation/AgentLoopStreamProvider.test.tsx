import {
  useIsAgentLoopStreaming,
  useOngoingAgentLoopConversationId,
} from "@app/components/assistant/conversation/AgentLoopStreamContext";
import { AgentLoopStreamProvider } from "@app/components/assistant/conversation/AgentLoopStreamProvider";
import { eventSourceManager } from "@app/lib/client/event_source_manager";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseOngoingAgentLoops = vi.hoisted(() => vi.fn());
const mockRefreshOngoingAgentLoops = vi.hoisted(() => vi.fn());

vi.mock("@app/hooks/useEventSource", () => ({
  useEventSource: vi.fn(),
}));

vi.mock("@app/lib/swr/ongoing_agent_loops", () => ({
  useOngoingAgentLoops: (...args: unknown[]) =>
    mockUseOngoingAgentLoops(...args),
}));

const owner = LightWorkspaceFactory.build({ sId: "w_1" });

function StreamIndicator() {
  return useIsAgentLoopStreaming("conv_1") ? "active" : "inactive";
}

interface OngoingConversationProps {
  conversationIds: string[];
}

function OngoingConversation({ conversationIds }: OngoingConversationProps) {
  const conversationId =
    useOngoingAgentLoopConversationId(conversationIds) ?? "none";
  return <div data-testid="ongoing-conversation">{conversationId}</div>;
}

describe("AgentLoopStreamProvider", () => {
  beforeEach(() => {
    mockUseOngoingAgentLoops.mockReset();
    mockRefreshOngoingAgentLoops.mockReset();
    vi.spyOn(eventSourceManager, "resume").mockImplementation(() => undefined);
    vi.spyOn(eventSourceManager, "stopKeepingAlive").mockImplementation(
      () => undefined
    );
    vi.spyOn(eventSourceManager, "releaseWorkspace").mockImplementation(
      () => undefined
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("offers every successful registry refresh to the manager", () => {
    mockUseOngoingAgentLoops.mockReturnValue({
      ongoingAgentLoops: [],
      refreshOngoingAgentLoops: mockRefreshOngoingAgentLoops,
    });

    render(
      <AgentLoopStreamProvider owner={owner}>
        <div />
      </AgentLoopStreamProvider>
    );
    const [{ onSuccess }] = mockUseOngoingAgentLoops.mock.calls[0];
    onSuccess([
      { conversationId: "conv_1", messageId: "msg_1" },
      { conversationId: "conv_2", messageId: "msg_2" },
    ]);

    expect(eventSourceManager.resume).toHaveBeenCalledTimes(2);
    expect(eventSourceManager.resume).toHaveBeenNthCalledWith(
      1,
      "message-msg_1"
    );
    expect(eventSourceManager.resume).toHaveBeenNthCalledWith(
      2,
      "message-msg_2"
    );
  });

  it("revokes keepalive when a cached registry entry disappears", () => {
    mockUseOngoingAgentLoops.mockReturnValue({
      ongoingAgentLoops: [
        { conversationId: "conv_cached", messageId: "msg_cached" },
      ],
      refreshOngoingAgentLoops: mockRefreshOngoingAgentLoops,
    });
    const view = render(
      <AgentLoopStreamProvider owner={owner}>
        <div />
      </AgentLoopStreamProvider>
    );

    mockUseOngoingAgentLoops.mockReturnValue({
      ongoingAgentLoops: [],
      refreshOngoingAgentLoops: mockRefreshOngoingAgentLoops,
    });
    view.rerender(
      <AgentLoopStreamProvider owner={owner}>
        <div />
      </AgentLoopStreamProvider>
    );

    expect(eventSourceManager.stopKeepingAlive).toHaveBeenCalledWith(
      "message-msg_cached",
      "w_1"
    );
  });

  it("observes every registered stream for a conversation", () => {
    mockUseOngoingAgentLoops.mockReturnValue({
      ongoingAgentLoops: [
        { conversationId: "conv_1", messageId: "msg_open" },
        { conversationId: "conv_1", messageId: "msg_failed" },
      ],
      refreshOngoingAgentLoops: mockRefreshOngoingAgentLoops,
    });
    vi.spyOn(eventSourceManager, "getConnectionState").mockImplementation(
      (streamId) =>
        streamId === "message-msg_open"
          ? { kind: "open", openedAt: 1 }
          : { kind: "failed", attempt: 1, error: new Error("failed") }
    );

    render(
      <AgentLoopStreamProvider owner={owner}>
        <StreamIndicator />
      </AgentLoopStreamProvider>
    );

    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("exposes the first matching ongoing conversation", () => {
    mockUseOngoingAgentLoops.mockReturnValue({
      ongoingAgentLoops: [
        { conversationId: "conv_2", messageId: "msg_2" },
        { conversationId: "conv_3", messageId: "msg_3" },
      ],
      refreshOngoingAgentLoops: mockRefreshOngoingAgentLoops,
    });

    const view = render(
      <AgentLoopStreamProvider owner={owner}>
        <OngoingConversation conversationIds={["conv_1", "conv_2", "conv_3"]} />
      </AgentLoopStreamProvider>
    );

    expect(view.getByTestId("ongoing-conversation")).toHaveTextContent(
      "conv_2"
    );
  });
});
