import { ConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import {
  FilePreviewProvider,
  useFilePreviewContext,
} from "@app/components/assistant/conversation/FilePreviewContext";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const mockOwner = LightWorkspaceFactory.build({ sId: "w_test_ws" });

function Consumer() {
  const { openFilePreview } = useFilePreviewContext();
  return (
    <button
      type="button"
      onClick={() =>
        openFilePreview({
          filePath: "conversation-c1/report.pdf",
          contentType: "application/pdf",
        })
      }
    >
      open
    </button>
  );
}

function withSidePanel(children: ReactNode) {
  const openPanel = vi.fn();
  return {
    openPanel,
    ui: (
      <ConversationSidePanelContext.Provider
        value={{
          currentPanel: undefined,
          isPanelClosing: false,
          openPanel,
          togglePanel: vi.fn(),
          closePanel: vi.fn(),
          removeFromPanelHistory: vi.fn(),
          onPanelClosed: vi.fn(),
          setPanelRef: vi.fn(),
          panelRef: { current: null },
          setVirtuosoMsg: vi.fn(),
          virtuosoMsg: null,
          data: undefined,
        }}
      >
        {children}
      </ConversationSidePanelContext.Provider>
    ),
  };
}

describe("useFilePreviewContext", () => {
  it("throws when no FilePreviewProvider is mounted", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { ui } = withSidePanel(<Consumer />);
    expect(() => render(ui)).toThrow(
      /must be used within a FilePreviewProvider/
    );

    consoleError.mockRestore();
  });

  it("routes a previewable file to the side panel", () => {
    const { openPanel, ui } = withSidePanel(
      <FilePreviewProvider owner={mockOwner}>
        <Consumer />
      </FilePreviewProvider>
    );
    render(ui);

    fireEvent.click(screen.getByRole("button", { name: "open" }));

    expect(openPanel).toHaveBeenCalledWith({
      type: "file_preview",
      filePath: "conversation-c1/report.pdf",
    });
  });
});
