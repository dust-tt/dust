import {
  ConversationSidePanelProvider,
  useConversationSidePanelContext,
} from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { useHashParam } from "@app/hooks/useHashParams";
import { FULL_SCREEN_HASH_PARAM } from "@app/types/conversation_side_panel";
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/hooks/useActiveConversationId", () => ({
  useActiveConversationId: () => "conv-1",
}));

type Panel = ReturnType<typeof useConversationSidePanelContext>;
type FullScreen = ReturnType<typeof useHashParam>;

function renderProvider() {
  const ref: { current: Panel | null } = { current: null };
  const fullScreenRef: { current: FullScreen | null } = { current: null };

  function Probe() {
    ref.current = useConversationSidePanelContext();
    fullScreenRef.current = useHashParam(FULL_SCREEN_HASH_PARAM);
    return null;
  }

  render(
    <ConversationSidePanelProvider>
      <Probe />
    </ConversationSidePanelProvider>
  );

  return {
    get panel() {
      if (!ref.current) {
        throw new Error("provider did not render");
      }
      return ref.current;
    },
    get fullScreen() {
      if (!fullScreenRef.current) {
        throw new Error("provider did not render");
      }
      return fullScreenRef.current;
    },
  };
}

function resetHash() {
  act(() => {
    window.history.replaceState(null, "", window.location.pathname);
  });
}

describe("ConversationSidePanelProvider selection", () => {
  beforeEach(resetHash);

  it("switches content when a different panel is selected", () => {
    const probe = renderProvider();

    act(() => probe.panel.openPanel({ type: "files" }));
    expect(probe.panel.currentPanel).toBe("files");
    expect(probe.panel.data).toBe("files");

    act(() => probe.panel.openPanel({ type: "credits" }));
    expect(probe.panel.currentPanel).toBe("credits");
    expect(probe.panel.data).toBe("credits");
  });

  it("addresses a single action separately from its message", () => {
    const probe = renderProvider();

    act(() => probe.panel.openPanel({ type: "actions", messageId: "msg_1" }));
    expect(probe.panel.data).toBe("msg_1");

    act(() =>
      probe.panel.openPanel({
        type: "actions",
        messageId: "msg_1",
        actionId: "act_1",
      })
    );
    expect(probe.panel.data).toBe("msg_1@act_1");
  });
});

describe("ConversationSidePanelProvider toggle", () => {
  beforeEach(resetHash);

  it("closes the panel when the shown panel is reselected", () => {
    const probe = renderProvider();

    act(() => probe.panel.togglePanel({ type: "files" }));
    expect(probe.panel.currentPanel).toBe("files");

    act(() => probe.panel.togglePanel({ type: "files" }));
    act(() => probe.panel.onPanelClosed());
    expect(probe.panel.currentPanel).toBeUndefined();
  });

  it("switches rather than closing when a different panel is selected", () => {
    const probe = renderProvider();

    act(() => probe.panel.togglePanel({ type: "files" }));
    act(() => probe.panel.togglePanel({ type: "credits" }));

    expect(probe.panel.currentPanel).toBe("credits");
  });

  it("keeps the panel open when openPanel reselects the shown content", () => {
    const probe = renderProvider();

    act(() => probe.panel.openPanel({ type: "files" }));
    act(() => probe.panel.openPanel({ type: "files" }));

    expect(probe.panel.currentPanel).toBe("files");
  });
});

describe("ConversationSidePanelProvider full screen", () => {
  beforeEach(resetHash);

  it("leaves full screen when switching to another panel", () => {
    const probe = renderProvider();

    act(() =>
      probe.panel.openPanel({ type: "interactive_content", fileId: "fil_1" })
    );
    act(() => probe.fullScreen[1]("true"));
    expect(probe.fullScreen[0]).toBe("true");

    act(() => probe.panel.openPanel({ type: "files" }));
    expect(probe.fullScreen[0]).toBeUndefined();
  });

  it("stays full screen when the same panel refreshes its content", () => {
    const probe = renderProvider();

    act(() =>
      probe.panel.openPanel({ type: "interactive_content", fileId: "fil_1" })
    );
    act(() => probe.fullScreen[1]("true"));

    act(() =>
      probe.panel.openPanel({
        type: "interactive_content",
        fileId: "fil_1",
        timestamp: "123",
      })
    );

    expect(probe.fullScreen[0]).toBe("true");
  });
});
