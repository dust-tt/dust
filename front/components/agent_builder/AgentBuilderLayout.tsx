import { usePreviewPanelContext } from "@app/components/agent_builder/PreviewPanelContext";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import {
  cn,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@dust-tt/sparkle";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

const COLLAPSED_RIGHT_PANEL_SIZE = 3;
const MIN_EXPANDED_RIGHT_PANEL_SIZE = 20;
const DEFAULT_RIGHT_PANEL_SIZE = 30;
const DEFAULT_LEFT_PANEL_SIZE = 70;
const COPILOT_LEFT_PANEL_SIZE = 50;
const COPILOT_RIGHT_PANEL_SIZE = 50;

interface AgentBuilderLayoutProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  copilotEnabled?: boolean;
}

export function AgentBuilderLayout({
  leftPanel,
  rightPanel,
  copilotEnabled = false,
}: AgentBuilderLayoutProps) {
  const leftPanelSize = copilotEnabled
    ? COPILOT_LEFT_PANEL_SIZE
    : DEFAULT_LEFT_PANEL_SIZE;
  const rightPanelSize = copilotEnabled
    ? COPILOT_RIGHT_PANEL_SIZE
    : DEFAULT_RIGHT_PANEL_SIZE;
  const isMobile = useIsMobile();
  const { isPreviewPanelOpen, setIsPreviewPanelOpen } =
    usePreviewPanelContext();
  const previewPanelRef = useRef<ImperativePanelHandle>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (previewPanelRef.current) {
      if (isPreviewPanelOpen) {
        previewPanelRef.current.expand();
      } else {
        previewPanelRef.current.collapse();
      }
    }
  }, [isPreviewPanelOpen]);

  const handlePanelCollapse = () => {
    setIsPreviewPanelOpen(false);
  };

  const handlePanelExpand = () => {
    setIsPreviewPanelOpen(true);
  };

  return (
    <div className="flex h-dvh flex-row">
      <div
        className={cn(
          "relative h-full w-full flex-1 flex-col overflow-hidden",
          "bg-background text-foreground",
          "dark:bg-background-night dark:text-foreground-night"
        )}
      >
        <main className="flex h-full w-full flex-col items-center">
          {loaded && (
            <div className="flex h-full w-full">
              {isMobile ? (
                leftPanel
              ) : (
                <ResizablePanelGroup
                  id="agent-builder-layout"
                  autoSaveId="agent-builder-layout"
                  direction="horizontal"
                  className="h-full w-full"
                >
                  <ResizablePanel defaultSize={leftPanelSize} minSize={30}>
                    <div className="h-full w-full overflow-y-auto">
                      {leftPanel}
                    </div>
                  </ResizablePanel>

                  <ResizableHandle
                    withHandle={isPreviewPanelOpen}
                    disabled={!isPreviewPanelOpen}
                    onDragging={(isDragging) => setIsResizing(isDragging)}
                  />

                  <ResizablePanel
                    ref={previewPanelRef}
                    id="preview-panel"
                    defaultSize={rightPanelSize}
                    minSize={
                      isPreviewPanelOpen
                        ? MIN_EXPANDED_RIGHT_PANEL_SIZE
                        : COLLAPSED_RIGHT_PANEL_SIZE
                    }
                    collapsedSize={COLLAPSED_RIGHT_PANEL_SIZE}
                    collapsible={true}
                    onCollapse={handlePanelCollapse}
                    onExpand={handlePanelExpand}
                    className={
                      !isResizing
                        ? "overflow-hidden transition-all duration-300 ease-in-out"
                        : "overflow-hidden"
                    }
                  >
                    <div className="h-full w-full overflow-y-auto">
                      {rightPanel}
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
