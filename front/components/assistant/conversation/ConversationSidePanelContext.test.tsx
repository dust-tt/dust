import {
  ConversationSidePanelProvider,
  useConversationSidePanelContext,
  useRegisterSidePanelConversation,
} from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { trackFrameOpen } from "@app/components/assistant/conversation/interactive_content/frameTracking";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const activeConversation = vi.hoisted(() => ({ id: "conv_1" }));

vi.mock(
  "@app/components/assistant/conversation/interactive_content/frameTracking",
  () => ({ trackFrameOpen: vi.fn() })
);

const FRAME_CLICK = {
  source: "user",
  uiElement: "message_frame_card",
} as const;

vi.mock("@app/hooks/useActiveConversationId", () => ({
  useActiveConversationId: () => activeConversation.id,
}));

// In-memory stand-in for the URL hash: one store shared by every useHashParam call, so tests can
// also write it from outside like a deep link or browser navigation would.
const hash = vi.hoisted(() => {
  const values: Record<string, string | undefined> = {};
  const listeners = new Set<() => void>();
  return {
    values,
    listeners,
    set(next: Record<string, string | undefined>) {
      Object.assign(values, next);
      for (const listener of listeners) {
        listener();
      }
    },
    reset() {
      for (const key of Object.keys(values)) {
        delete values[key];
      }
    },
  };
});

vi.mock("@app/hooks/useHashParams", async () => {
  const React = await import("react");
  return {
    useHashParam: (key: string) => {
      // Like the real hook: stable setter, re-render only when this key's value changes.
      const [value, setValue] = React.useState<string | undefined>(
        hash.values[key]
      );
      React.useEffect(() => {
        const listener = () => setValue(hash.values[key]);
        hash.listeners.add(listener);
        return () => {
          hash.listeners.delete(listener);
        };
      }, [key]);
      // The provider only ever sets plain values, never updater functions.
      const setter = React.useCallback(
        (next?: string) => {
          hash.set({ [key]: next });
        },
        [key]
      );
      return [value, setter];
    },
  };
});

// Like the conversation page, Analytics or the agent builder preview: the host registers the
// conversation it shows, which is not always the one in the URL.
function renderSidePanelHosting(conversationId: string) {
  return renderHook(
    () => {
      useRegisterSidePanelConversation(conversationId);
      return useConversationSidePanelContext();
    },
    { wrapper: ConversationSidePanelProvider }
  );
}

function renderSidePanel() {
  return renderHook(() => useConversationSidePanelContext(), {
    wrapper: ConversationSidePanelProvider,
  });
}

beforeEach(() => {
  hash.reset();
  activeConversation.id = "conv_1";
  vi.mocked(trackFrameOpen).mockClear();
});

describe("ConversationSidePanelProvider history", () => {
  it("stacks panels of different types and closing goes back", () => {
    const { result } = renderSidePanel();
    act(() => result.current.openPanel({ type: "files" }));
    act(() => result.current.openPanel({ type: "credits" }));
    expect(result.current.currentPanel).toBe("credits");

    act(() => result.current.closePanel());
    expect(result.current.currentPanel).toBe("files");

    act(() => result.current.closePanel());
    expect(result.current.currentPanel).toBeUndefined();
  });

  it("re-clicking the shown panel goes back too", () => {
    const { result } = renderSidePanel();
    act(() => result.current.openPanel({ type: "files" }));
    act(() => result.current.togglePanel({ type: "credits" }));
    act(() => result.current.togglePanel({ type: "credits" }));
    expect(result.current.currentPanel).toBe("files");
  });

  it("panels of the same type replace each other instead of stacking", () => {
    const { result } = renderSidePanel();
    act(() => result.current.openPanel({ type: "files" }));
    act(() => result.current.openPanel({ type: "actions", messageId: "m1" }));
    act(() => result.current.openPanel({ type: "actions", messageId: "m2" }));

    act(() => result.current.closePanel());
    expect(result.current.currentPanel).toBe("files");
  });

  it("keeps the shown panel of the same type when asked, and closing goes back", () => {
    const { result } = renderSidePanel();
    act(() =>
      result.current.openPanel({
        type: "file_preview",
        kind: "path",
        filePath: "pod-p/plan.md",
      })
    );
    act(() =>
      result.current.openPanel(
        { type: "file_preview", kind: "path", filePath: "pod-p/report.pdf" },
        { keepCurrent: true }
      )
    );

    act(() => result.current.closePanel());
    expect(result.current.currentPanel).toBe("file_preview");
    expect(result.current.data).toContain("pod-p/plan.md");

    act(() => result.current.closePanel());
    expect(result.current.currentPanel).toBeUndefined();
  });

  it("a Frame refreshed with a new timestamp updates in place", () => {
    const { result } = renderSidePanel();
    act(() =>
      result.current.openPanel({
        type: "interactive_content",
        fileId: "fil_1",
        timestamp: "1",
        openedFrom: FRAME_CLICK,
      })
    );
    act(() =>
      result.current.openPanel({
        type: "interactive_content",
        fileId: "fil_1",
        timestamp: "2",
        openedFrom: FRAME_CLICK,
      })
    );
    expect(result.current.data).toBe("fil_1@2");

    act(() => result.current.closePanel());
    expect(result.current.currentPanel).toBeUndefined();
  });

  it("remembers a Frame without its timestamp", () => {
    const { result } = renderSidePanel();
    act(() =>
      result.current.openPanel({
        type: "interactive_content",
        fileId: "fil_1",
        timestamp: "1",
        openedFrom: FRAME_CLICK,
      })
    );
    act(() => result.current.openPanel({ type: "files" }));

    act(() => result.current.closePanel());
    expect(result.current.currentPanel).toBe("interactive_content");
    expect(result.current.data).toBe("fil_1");
  });

  it("never keeps the shown panel in the history", () => {
    const { result } = renderSidePanel();
    act(() => result.current.openPanel({ type: "files" }));
    act(() => result.current.openPanel({ type: "credits" }));
    act(() => result.current.openPanel({ type: "files" }));

    act(() => result.current.closePanel());
    expect(result.current.currentPanel).toBe("credits");
    act(() => result.current.closePanel());
    expect(result.current.currentPanel).toBeUndefined();
  });

  it("forgets panels whose content is gone", () => {
    const { result } = renderSidePanel();
    act(() => result.current.openPanel({ type: "plan" }));
    act(() => result.current.openPanel({ type: "files" }));
    act(() => result.current.removeFromPanelHistory("plan"));

    act(() => result.current.closePanel());
    expect(result.current.currentPanel).toBeUndefined();
  });

  it("switching conversation drops the panel and its history", () => {
    const { result, rerender } = renderSidePanel();
    act(() => result.current.openPanel({ type: "files" }));
    act(() => result.current.openPanel({ type: "credits" }));

    activeConversation.id = "conv_2";
    rerender();
    expect(result.current.currentPanel).toBeUndefined();

    act(() => result.current.openPanel({ type: "files" }));
    act(() => result.current.closePanel());
    expect(result.current.currentPanel).toBeUndefined();
  });
});

describe("ConversationSidePanelProvider auto-open dismiss", () => {
  it("remembers the closed Frame fileId until the conversation changes", () => {
    const { result, rerender } = renderSidePanel();
    act(() =>
      result.current.openPanel({
        type: "interactive_content",
        fileId: "fil_frame",
        openedFrom: FRAME_CLICK,
      })
    );
    expect(result.current.wasAutoOpenDismissedForFileId("fil_frame")).toBe(
      false
    );

    act(() => result.current.closePanel());
    expect(result.current.wasAutoOpenDismissedForFileId("fil_frame")).toBe(
      true
    );

    activeConversation.id = "conv_2";
    rerender();
    expect(result.current.wasAutoOpenDismissedForFileId("fil_frame")).toBe(
      false
    );
  });
});

describe("ConversationSidePanelProvider and the URL hash", () => {
  it("adopts a deep-linked panel as the bottom of the stack", () => {
    hash.set({ spid: "files", spt: "files" });
    const { result } = renderSidePanel();
    expect(result.current.currentPanel).toBe("files");

    act(() => result.current.openPanel({ type: "credits" }));

    act(() => result.current.closePanel());
    expect(result.current.currentPanel).toBe("files");
    act(() => result.current.closePanel());
    expect(result.current.currentPanel).toBeUndefined();
  });

  it("does not keep a panel in the history once navigation shows it", () => {
    const { result } = renderSidePanel();
    act(() => result.current.openPanel({ type: "files" }));
    act(() => result.current.openPanel({ type: "credits" }));

    act(() => hash.set({ spid: "files", spt: "files" }));
    expect(result.current.currentPanel).toBe("files");

    act(() => result.current.closePanel());
    expect(result.current.currentPanel).toBeUndefined();
  });

  it("follows browser navigation so the shown panel can be toggled closed", () => {
    const { result } = renderSidePanel();
    act(() => result.current.openPanel({ type: "files" }));

    act(() => hash.set({ spid: "credits", spt: "credits" }));
    expect(result.current.currentPanel).toBe("credits");

    act(() => result.current.togglePanel({ type: "credits" }));
    expect(result.current.currentPanel).toBeUndefined();
  });
});

describe("ConversationSidePanelProvider full screen", () => {
  it("leaves full screen when another panel takes over", () => {
    const { result } = renderSidePanel();
    act(() =>
      result.current.openPanel({
        type: "interactive_content",
        fileId: "fil_1",
        openedFrom: FRAME_CLICK,
      })
    );
    act(() => hash.set({ fullScreen: "true" }));

    act(() => result.current.openPanel({ type: "files" }));
    expect(hash.values.fullScreen).toBeUndefined();
  });

  it("stays full screen while the same Frame refreshes", () => {
    const { result } = renderSidePanel();
    act(() =>
      result.current.openPanel({
        type: "interactive_content",
        fileId: "fil_1",
        openedFrom: FRAME_CLICK,
      })
    );
    act(() => hash.set({ fullScreen: "true" }));

    act(() =>
      result.current.openPanel({
        type: "interactive_content",
        fileId: "fil_1",
        timestamp: "123",
        openedFrom: FRAME_CLICK,
      })
    );
    expect(hash.values.fullScreen).toBe("true");
  });
});

describe("ConversationSidePanelProvider hash encoding", () => {
  it.each([
    [{ type: "actions", messageId: "msg_1" }, "msg_1"],
    [{ type: "actions", messageId: "msg_1", actionId: "act_2" }, "msg_1@act_2"],
    [
      { type: "interactive_content", fileId: "fil_1", openedFrom: FRAME_CLICK },
      "fil_1",
    ],
    [
      {
        type: "interactive_content",
        fileId: "fil_1",
        timestamp: "123",
        openedFrom: FRAME_CLICK,
      },
      "fil_1@123",
    ],
    [
      {
        type: "file_preview",
        kind: "path",
        filePath: "conversation-abc/plan.md",
      },
      "conversation-abc/plan.md",
    ],
    [{ type: "file_preview", kind: "id", fileId: "fil_1" }, "id:fil_1"],
    [{ type: "files" }, "files"],
    [{ type: "credits" }, "credits"],
    [{ type: "plan" }, "plan"],
    [{ type: "skill", skillId: "skl_1" }, "skl_1"],
    [{ type: "agent", agentId: "agt_1" }, "agt_1"],
  ] as const)("writes %j as %s and reads it back", (params, spid) => {
    const { result } = renderSidePanel();
    act(() => result.current.openPanel(params));
    expect(result.current.currentPanel).toBe(params.type);
    expect(result.current.data).toBe(spid);

    // Restored from the hash, the same panel toggles closed rather than reopening.
    hash.reset();
    const restored = renderSidePanel();
    hash.set({ spid, spt: params.type });
    restored.rerender();
    act(() => restored.result.current.togglePanel(params));
    expect(restored.result.current.currentPanel).toBeUndefined();
  });
});

describe("ConversationSidePanelProvider Frame open tracking", () => {
  it("counts a Frame once while it refreshes, and again once replaced", () => {
    const { result } = renderSidePanelHosting("cnv_hosted");
    act(() =>
      result.current.openPanel({
        type: "interactive_content",
        fileId: "fil_1",
        timestamp: "1",
        openedFrom: { source: "agent", uiElement: "side_panel_auto_open" },
      })
    );
    act(() =>
      result.current.openPanel({
        type: "interactive_content",
        fileId: "fil_1",
        timestamp: "2",
        openedFrom: { source: "agent", uiElement: "side_panel_auto_open" },
      })
    );
    expect(trackFrameOpen).toHaveBeenCalledTimes(1);
    expect(trackFrameOpen).toHaveBeenCalledWith({
      frameId: "fil_1",
      origin: { source: "agent", uiElement: "side_panel_auto_open" },
      location: { type: "conversation", id: "cnv_hosted" },
    });

    act(() =>
      result.current.openPanel({
        type: "interactive_content",
        fileId: "fil_2",
        openedFrom: FRAME_CLICK,
      })
    );
    expect(trackFrameOpen).toHaveBeenCalledTimes(2);
  });

  it("does not count closing a Frame or going back to it", () => {
    const { result } = renderSidePanelHosting("cnv_hosted");
    const frame = {
      type: "interactive_content",
      fileId: "fil_1",
      openedFrom: FRAME_CLICK,
    } as const;
    act(() => result.current.openPanel(frame));
    act(() => result.current.openPanel({ type: "files" }));
    act(() => result.current.closePanel());
    expect(result.current.currentPanel).toBe("interactive_content");
    act(() => result.current.togglePanel(frame));
    expect(trackFrameOpen).toHaveBeenCalledTimes(1);
  });

  it("counts a Frame opened from the URL as page_url", () => {
    hash.set({ spid: "fil_1@123", spt: "interactive_content" });
    renderSidePanelHosting("cnv_hosted");
    expect(trackFrameOpen).toHaveBeenCalledTimes(1);
    expect(trackFrameOpen).toHaveBeenCalledWith({
      frameId: "fil_1",
      origin: { source: "user", uiElement: "page_url" },
      location: { type: "conversation", id: "cnv_hosted" },
    });
  });

  it("does not count Frames when no host registered a conversation", () => {
    const { result } = renderSidePanel();
    act(() =>
      result.current.openPanel({
        type: "interactive_content",
        fileId: "fil_1",
        openedFrom: FRAME_CLICK,
      })
    );
    expect(trackFrameOpen).not.toHaveBeenCalled();
  });
});
