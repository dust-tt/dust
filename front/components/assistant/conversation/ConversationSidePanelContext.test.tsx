import {
  ConversationSidePanelProvider,
  useConversationSidePanelContext,
} from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const activeConversation = vi.hoisted(() => ({ id: "conv_1" }));

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
      const setter = React.useCallback(
        (next?: string | ((prev?: string) => string)) => {
          hash.set({
            [key]: typeof next === "function" ? next(hash.values[key]) : next,
          });
        },
        [key]
      );
      return [value, setter];
    },
  };
});

function renderSidePanel() {
  return renderHook(() => useConversationSidePanelContext(), {
    wrapper: ConversationSidePanelProvider,
  });
}

beforeEach(() => {
  hash.reset();
  activeConversation.id = "conv_1";
});

describe("ConversationSidePanelProvider history", () => {
  it("stacks panels of different types and closing goes back", () => {
    const { result } = renderSidePanel();
    act(() => result.current.openPanel({ type: "files" }));
    act(() => result.current.openPanel({ type: "credits" }));
    expect(result.current.currentPanel).toBe("credits");
    expect(result.current.previousPanel).toEqual({ type: "files" });

    act(() => result.current.closePanel());
    expect(result.current.currentPanel).toBe("files");
    expect(result.current.previousPanel).toBeNull();

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
    expect(result.current.previousPanel).toEqual({ type: "files" });

    act(() => result.current.closePanel());
    expect(result.current.currentPanel).toBe("files");
  });

  it("a Frame refreshed with a new timestamp updates in place", () => {
    const { result } = renderSidePanel();
    act(() =>
      result.current.openPanel({
        type: "interactive_content",
        fileId: "fil_1",
        timestamp: "1",
      })
    );
    act(() =>
      result.current.openPanel({
        type: "interactive_content",
        fileId: "fil_1",
        timestamp: "2",
      })
    );
    expect(result.current.data).toBe("fil_1@2");
    expect(result.current.previousPanel).toBeNull();
  });

  it("remembers a Frame without its timestamp", () => {
    const { result } = renderSidePanel();
    act(() =>
      result.current.openPanel({
        type: "interactive_content",
        fileId: "fil_1",
        timestamp: "1",
      })
    );
    act(() => result.current.openPanel({ type: "files" }));
    expect(result.current.previousPanel).toEqual({
      type: "interactive_content",
      fileId: "fil_1",
    });

    act(() => result.current.closePanel());
    expect(result.current.data).toBe("fil_1");
  });

  it("never keeps the shown panel in the history", () => {
    const { result } = renderSidePanel();
    act(() => result.current.openPanel({ type: "files" }));
    act(() => result.current.openPanel({ type: "credits" }));
    act(() => result.current.openPanel({ type: "files" }));
    expect(result.current.previousPanel).toEqual({ type: "credits" });

    act(() => result.current.closePanel());
    expect(result.current.currentPanel).toBe("credits");
    act(() => result.current.closePanel());
    expect(result.current.currentPanel).toBeUndefined();
  });

  it("forgets panels whose content is gone", () => {
    const { result } = renderSidePanel();
    act(() => result.current.openPanel({ type: "plan" }));
    act(() => result.current.openPanel({ type: "files" }));
    act(() => result.current.forgetPanels("plan"));
    expect(result.current.previousPanel).toBeNull();

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
    expect(result.current.previousPanel).toBeNull();
  });
});

describe("ConversationSidePanelProvider and the URL hash", () => {
  it("adopts a deep-linked panel as the bottom of the stack", () => {
    hash.set({ spid: "files", spt: "files" });
    const { result } = renderSidePanel();
    expect(result.current.currentPanel).toBe("files");

    act(() => result.current.openPanel({ type: "credits" }));
    expect(result.current.previousPanel).toEqual({ type: "files" });

    act(() => result.current.closePanel());
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
