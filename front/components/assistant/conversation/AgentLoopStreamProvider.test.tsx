import { AgentLoopStreamProvider } from "@app/components/assistant/conversation/AgentLoopStreamProvider";
import { eventSourceManager } from "@app/lib/client/event_source_manager";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { render } from "@testing-library/react";
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
});
