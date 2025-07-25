import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

import { usePreviewPanelContext } from "@app/components/assistant_builder/contexts/PreviewPanelContext";

interface BuilderLayoutProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
}

export function BuilderLayout({ leftPanel, rightPanel }: BuilderLayoutProps) {
  const { isPreviewPanelOpen } = usePreviewPanelContext();
  const previewPanelRef = useRef<ImperativePanelHandle>(null);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (previewPanelRef.current) {
      if (isPreviewPanelOpen) {
        previewPanelRef.current.expand();
      } else {
        previewPanelRef.current.collapse();
      }
    }
  }, [isPreviewPanelOpen]);

  return (
    <ResizablePanelGroup
      id="assistant-builder-layout"
      autoSaveId="assistant-builder-layout"
      direction="horizontal"
      className="h-full w-full"
    >
      <ResizablePanel defaultSize={70} minSize={30}>
        <div className="h-full w-full overflow-y-auto px-6">{leftPanel}</div>
      </ResizablePanel>

      <ResizableHandle onDragging={(isDragging) => setIsResizing(isDragging)} />

      <ResizablePanel
        ref={previewPanelRef}
        id="preview-panel"
        defaultSize={30}
        minSize={20}
        collapsible={true}
        className={
          !isResizing
            ? "overflow-hidden transition-all duration-300 ease-in-out"
            : "overflow-hidden"
        }
      >
        <div className="h-full w-full overflow-y-auto px-6">{rightPanel}</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
