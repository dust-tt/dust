import { makeInitialMessageStreamState } from "@app/components/assistant/conversation/types";
import { useAutoOpenSidePanel } from "@app/components/assistant/conversation/useAutoOpenSidePanel";
import type { ClientType } from "@app/lib/context/clientType";
import { mockAgentMessage } from "@app/tests/utils/conversation_test_factories";
import { frameV2ContentType } from "@app/types/files";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { openPanel, surface, panelState, dismissedFileIds } = vi.hoisted(() => {
  const surface: { clientType: ClientType; isMobile: boolean } = {
    clientType: "web",
    isMobile: false,
  };
  const panelState: { currentPanel: string | null; data: string | null } = {
    currentPanel: null,
    data: null,
  };
  const dismissedFileIds = new Set<string>();
  return { openPanel: vi.fn(), surface, panelState, dismissedFileIds };
});

vi.mock(
  "@app/components/assistant/conversation/ConversationSidePanelContext",
  () => ({
    useConversationSidePanelContext: () => ({
      currentPanel: panelState.currentPanel,
      data: panelState.data,
      openPanel,
      wasAutoOpenDismissedForFileId: (fileId: string) =>
        dismissedFileIds.has(fileId),
    }),
  })
);

vi.mock("@app/lib/context/clientType", () => ({
  useClientType: () => surface.clientType,
}));

vi.mock("@app/lib/swr/useIsMobile", () => ({
  useIsMobile: () => surface.isMobile,
}));

const regularFile = {
  contentType: "text/csv",
  fileId: "fil_regular",
  title: "report.csv",
  hidden: false,
};

function renderWithRegularFile() {
  const agentMessage = makeInitialMessageStreamState({
    ...mockAgentMessage({ content: "Done." }),
    sId: "agent-message-1",
    generatedFiles: [regularFile],
  });

  return renderHook(() =>
    useAutoOpenSidePanel({ agentMessage, isLastMessage: true })
  );
}

describe("useAutoOpenSidePanel", () => {
  beforeEach(() => {
    openPanel.mockClear();
    surface.clientType = "web";
    surface.isMobile = false;
    panelState.currentPanel = null;
    panelState.data = null;
    dismissedFileIds.clear();
  });

  it("opens the files panel for a generated file on the desktop web app", async () => {
    renderWithRegularFile();

    await waitFor(() => {
      expect(openPanel).toHaveBeenCalledWith({ type: "files" });
    });
  });

  it("does not open any panel in the extension, where the panel covers the conversation", async () => {
    surface.clientType = "extension";

    renderWithRegularFile();

    await waitFor(() => {
      expect(openPanel).not.toHaveBeenCalled();
    });
  });

  it("does not open any panel on mobile", async () => {
    surface.isMobile = true;

    renderWithRegularFile();

    await waitFor(() => {
      expect(openPanel).not.toHaveBeenCalled();
    });
  });

  it("classifies a completed Frames v2 file as a Frame and opens it", async () => {
    const frame = {
      contentType: frameV2ContentType,
      fileId: "fil_frame_v2",
      title: "Hello Frame",
      hidden: false,
      updatedAt: 1_710_000_000_000,
    };
    const agentMessage = makeInitialMessageStreamState({
      ...mockAgentMessage({ content: "Done." }),
      sId: "agent-message-1",
      generatedFiles: [frame],
    });

    renderHook(() =>
      useAutoOpenSidePanel({ agentMessage, isLastMessage: true })
    );

    await waitFor(() => {
      expect(openPanel).toHaveBeenCalledWith({
        type: "interactive_content",
        fileId: frame.fileId,
        timestamp: "1710000000000",
      });
    });
  });

  it("refreshes an already-open Frame when completed files carry a newer updatedAt", async () => {
    panelState.currentPanel = "interactive_content";
    panelState.data = "fil_frame_v2@1710000000000";

    const frame = {
      contentType: frameV2ContentType,
      fileId: "fil_frame_v2",
      title: "Hello Frame",
      hidden: false,
      updatedAt: 1_710_000_000_999,
    };
    const agentMessage = makeInitialMessageStreamState({
      ...mockAgentMessage({ content: "Updated." }),
      sId: "agent-message-2",
      generatedFiles: [frame],
    });

    renderHook(() =>
      useAutoOpenSidePanel({ agentMessage, isLastMessage: true })
    );

    await waitFor(() => {
      expect(openPanel).toHaveBeenCalledWith({
        type: "interactive_content",
        fileId: frame.fileId,
        timestamp: "1710000000999",
      });
    });
  });

  it("does not auto-open a Frame the user previously closed, even after an update", async () => {
    dismissedFileIds.add("fil_frame_v2");

    const frame = {
      contentType: frameV2ContentType,
      fileId: "fil_frame_v2",
      title: "Hello Frame",
      hidden: false,
      updatedAt: 1_710_000_000_999,
    };
    const agentMessage = makeInitialMessageStreamState({
      ...mockAgentMessage({ content: "Updated." }),
      sId: "agent-message-2",
      generatedFiles: [frame],
    });

    renderHook(() =>
      useAutoOpenSidePanel({ agentMessage, isLastMessage: true })
    );

    await waitFor(() => {
      expect(openPanel).not.toHaveBeenCalled();
    });
  });

  it("still refreshes a dismissed Frame when its panel is already open", async () => {
    dismissedFileIds.add("fil_frame_v2");
    panelState.currentPanel = "interactive_content";
    panelState.data = "fil_frame_v2@1710000000000";

    const frame = {
      contentType: frameV2ContentType,
      fileId: "fil_frame_v2",
      title: "Hello Frame",
      hidden: false,
      updatedAt: 1_710_000_000_999,
    };
    const agentMessage = makeInitialMessageStreamState({
      ...mockAgentMessage({ content: "Updated." }),
      sId: "agent-message-2",
      generatedFiles: [frame],
    });

    renderHook(() =>
      useAutoOpenSidePanel({ agentMessage, isLastMessage: true })
    );

    await waitFor(() => {
      expect(openPanel).toHaveBeenCalledWith({
        type: "interactive_content",
        fileId: frame.fileId,
        timestamp: "1710000000999",
      });
    });
  });

  it("opens a Frame from progress when the panel is closed", async () => {
    const agentMessage = makeInitialMessageStreamState({
      ...mockAgentMessage({ content: "Publishing..." }),
      sId: "agent-message-1",
    });
    agentMessage.streaming.actionProgress.set(1, {
      action: {} as never,
      progress: {
        progress: 1,
        total: 1,
        progressToken: 1,
        _meta: {
          data: {
            label: "Publishing Frame...",
            output: {
              type: "interactive_content_file",
              fileId: "fil_frame",
              mimeType: frameV2ContentType,
              title: "Hello",
              updatedAt: "pub-1",
              autoOpen: false,
            },
          },
        },
      },
    });

    renderHook(() =>
      useAutoOpenSidePanel({ agentMessage, isLastMessage: true })
    );

    await waitFor(() => {
      expect(openPanel).toHaveBeenCalledWith({
        type: "interactive_content",
        fileId: "fil_frame",
        timestamp: "pub-1",
      });
    });
  });

  it("does not steal the file explorer for soft-open publish notifications", async () => {
    panelState.currentPanel = "files";
    const agentMessage = makeInitialMessageStreamState({
      ...mockAgentMessage({ content: "Publishing..." }),
      sId: "agent-message-1",
    });
    agentMessage.streaming.actionProgress.set(1, {
      action: {} as never,
      progress: {
        progress: 1,
        total: 1,
        progressToken: 1,
        _meta: {
          data: {
            label: "Publishing Frame...",
            output: {
              type: "interactive_content_file",
              fileId: "fil_frame",
              mimeType: frameV2ContentType,
              title: "Hello",
              updatedAt: "pub-1",
              autoOpen: false,
            },
          },
        },
      },
    });

    renderHook(() =>
      useAutoOpenSidePanel({ agentMessage, isLastMessage: true })
    );

    await waitFor(() => {
      expect(openPanel).not.toHaveBeenCalled();
    });
  });

  it("still opens Frame over the file explorer for explicit interactive content", async () => {
    panelState.currentPanel = "files";
    const agentMessage = makeInitialMessageStreamState({
      ...mockAgentMessage({ content: "Opening..." }),
      sId: "agent-message-1",
    });
    agentMessage.streaming.actionProgress.set(1, {
      action: {} as never,
      progress: {
        progress: 1,
        total: 1,
        progressToken: 1,
        _meta: {
          data: {
            label: "Opening Frame...",
            output: {
              type: "interactive_content_file",
              fileId: "fil_frame",
              mimeType: frameV2ContentType,
              title: "Hello",
              updatedAt: "1710000000000",
            },
          },
        },
      },
    });

    renderHook(() =>
      useAutoOpenSidePanel({ agentMessage, isLastMessage: true })
    );

    await waitFor(() => {
      expect(openPanel).toHaveBeenCalledWith({
        type: "interactive_content",
        fileId: "fil_frame",
        timestamp: "1710000000000",
      });
    });
  });
});
