import { useEventSource } from "@app/hooks/useEventSource";
import { eventSourceManager } from "@app/lib/client/event_source_manager";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockHasFeature = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/auth/AuthContext", () => ({
  useFeatureFlags: () => ({ hasFeature: mockHasFeature }),
}));

describe("useEventSource", () => {
  beforeEach(() => {
    mockHasFeature.mockReset();
    vi.spyOn(eventSourceManager, "subscribe").mockReturnValue(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    { enabled: true, expected: "immediate" },
    { enabled: false, expected: "fallback" },
  ] as const)("uses $expected long-poll activation when the workspace flag is $enabled", ({
    enabled,
    expected,
  }) => {
    mockHasFeature.mockReturnValue(enabled);
    const buildLongPollURL = vi.fn();
    const { unmount } = renderHook(() =>
      useEventSource(vi.fn(), vi.fn(), "message-msg_1", {
        workspaceId: "w_1",
        buildLongPollURL,
      })
    );

    expect(eventSourceManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          workspaceId: "w_1",
          buildLongPollURL: expect.any(Function),
          longPollActivation: expected,
        }),
      })
    );
    unmount();
  });

  it("keeps SSE for streams without a long-poll endpoint", () => {
    mockHasFeature.mockReturnValue(true);
    const { unmount } = renderHook(() =>
      useEventSource(vi.fn(), vi.fn(), "conversation-conv_1", {
        workspaceId: "w_1",
      })
    );

    expect(eventSourceManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          buildLongPollURL: undefined,
          longPollActivation: "fallback",
        }),
      })
    );
    unmount();
  });
});
