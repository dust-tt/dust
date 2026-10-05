import {
  useIsAgentLoopStreaming,
  useOngoingAgentLoopsSnapshot,
  useRegisterAgentLoopStream,
} from "@app/components/assistant/conversation/AgentLoopStreamContext";
import { AgentLoopStreamProvider } from "@app/components/assistant/conversation/AgentLoopStreamProvider";
import { eventSourceManager } from "@app/lib/client/event_source_manager";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { act, render, screen } from "@testing-library/react";
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

function RegistryStatus() {
  const snapshot = useOngoingAgentLoopsSnapshot();
  return snapshot ? `${snapshot.agentLoops.length} loops` : "pending";
}

function MountedMessageStream() {
  useRegisterAgentLoopStream({
    conversationId: "conv_1",
    enabled: true,
    streamId: "message-msg_1",
  });
  return null;
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
    act(() =>
      onSuccess([
        { conversationId: "conv_1", messageId: "msg_1" },
        { conversationId: "conv_2", messageId: "msg_2" },
      ])
    );

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

  it("only publishes successful registry responses to the conversation view", () => {
    mockUseOngoingAgentLoops.mockReturnValue({
      ongoingAgentLoops: [
        { conversationId: "conv_1", messageId: "msg_cached" },
      ],
      refreshOngoingAgentLoops: mockRefreshOngoingAgentLoops,
    });

    render(
      <AgentLoopStreamProvider owner={owner}>
        <RegistryStatus />
      </AgentLoopStreamProvider>
    );
    expect(screen.getByText("pending")).toBeInTheDocument();

    const [{ onSuccess }] = mockUseOngoingAgentLoops.mock.calls[0];
    act(() => onSuccess([]));
    expect(screen.getByText("0 loops")).toBeInTheDocument();
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

  it.each(["terminal", "failed"] as const)(
    "keeps the sidebar streaming across navigation until the manager reports %s",
    (stoppedState) => {
      mockUseOngoingAgentLoops.mockReturnValue({
        ongoingAgentLoops: [],
        refreshOngoingAgentLoops: mockRefreshOngoingAgentLoops,
      });
      let connectionState: "open" | "terminal" | "failed" = "open";
      let notifyStateChange: (() => void) | undefined;
      vi.spyOn(eventSourceManager, "getConnectionState").mockImplementation(
        () =>
          connectionState === "open"
            ? { kind: "open", openedAt: 1 }
            : connectionState === "failed"
              ? { kind: "failed", attempt: 1, error: new Error("disconnected") }
              : { kind: "terminal" }
      );
      vi.spyOn(
        eventSourceManager,
        "subscribeToConnectionState"
      ).mockImplementation((_streamId, listener) => {
        notifyStateChange = listener;
        return () => {
          if (notifyStateChange === listener) {
            notifyStateChange = undefined;
          }
        };
      });

      const renderProvider = (showMessage: boolean) => (
        <AgentLoopStreamProvider owner={owner}>
          <StreamIndicator />
          {showMessage && <MountedMessageStream />}
        </AgentLoopStreamProvider>
      );
      const view = render(renderProvider(true));
      expect(screen.getByText("active")).toBeInTheDocument();

      view.rerender(renderProvider(false));
      expect(screen.getByText("active")).toBeInTheDocument();

      act(() => {
        connectionState = stoppedState;
        notifyStateChange?.();
      });
      expect(screen.getByText("inactive")).toBeInTheDocument();
    }
  );
});
