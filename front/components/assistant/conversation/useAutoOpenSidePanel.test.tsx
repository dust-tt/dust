import { makeInitialMessageStreamState } from "@app/components/assistant/conversation/types";
import { useAutoOpenSidePanel } from "@app/components/assistant/conversation/useAutoOpenSidePanel";
import { mockAgentMessage } from "@app/tests/utils/conversation_test_factories";
import { frameV2ContentType } from "@app/types/files";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { closePanel, openPanel } = vi.hoisted(() => ({
  closePanel: vi.fn(),
  openPanel: vi.fn(),
}));

vi.mock(
  "@app/components/assistant/conversation/ConversationSidePanelContext",
  () => ({
    useConversationSidePanelContext: () => ({
      closePanel,
      currentPanel: null,
      openPanel,
    }),
  })
);

vi.mock("@app/hooks/conversations", () => ({
  useConversationMessageAction: () => ({ action: null }),
}));

vi.mock("@app/hooks/useActiveConversationId", () => ({
  useActiveConversationId: () => "conversation-1",
}));

vi.mock("@app/lib/auth/AuthContext", () => ({
  useAuth: () => ({ workspace: { sId: "workspace-1" } }),
}));

vi.mock("@app/lib/swr/useIsMobile", () => ({
  useIsMobile: () => false,
}));

describe("useAutoOpenSidePanel", () => {
  beforeEach(() => {
    closePanel.mockClear();
    openPanel.mockClear();
  });

  it("classifies a completed Frames v2 file as a Frame and opens it", async () => {
    const frame = {
      contentType: frameV2ContentType,
      fileId: "fil_frame_v2",
      title: "Hello Frame",
      hidden: false,
    };
    const agentMessage = makeInitialMessageStreamState({
      ...mockAgentMessage({ content: "Done." }),
      sId: "agent-message-1",
      generatedFiles: [frame],
    });

    const { result } = renderHook(() =>
      useAutoOpenSidePanel({ agentMessage, isLastMessage: true })
    );

    expect(result.current.interactiveFiles).toEqual([frame]);
    await waitFor(() => {
      expect(openPanel).toHaveBeenCalledWith({
        type: "interactive_content",
        fileId: frame.fileId,
      });
    });
  });
});
