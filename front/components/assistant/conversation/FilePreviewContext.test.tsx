import { ConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import {
  FilePreviewProvider,
  useFilePreviewContext,
} from "@app/components/assistant/conversation/FilePreviewContext";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const mockOwner = LightWorkspaceFactory.build({ sId: "w_test_ws" });

function Consumer() {
  const { canPreview } = useFilePreviewContext();
  return <span>{canPreview ? "can preview" : "cannot preview"}</span>;
}

function withSidePanel(children: ReactNode) {
  return (
    <ConversationSidePanelContext.Provider
      value={{
        currentPanel: undefined,
        isPanelClosing: false,
        openPanel: vi.fn(),
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
  );
}

describe("useFilePreviewContext", () => {
  it("throws when no FilePreviewProvider is mounted", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(() => render(withSidePanel(<Consumer />))).toThrow(
      /must be used within a FilePreviewProvider/
    );

    consoleError.mockRestore();
  });

  it("reports previews as available under a side panel", () => {
    render(
      withSidePanel(
        <FilePreviewProvider owner={mockOwner}>
          <Consumer />
        </FilePreviewProvider>
      )
    );

    expect(screen.getByText("can preview")).toBeInTheDocument();
  });
});
