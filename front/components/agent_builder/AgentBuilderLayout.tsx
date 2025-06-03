import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@dust-tt/sparkle";
import { cn } from "@dust-tt/sparkle";
import Head from "next/head";
import { useContext, useEffect, useRef, useState } from "react";
import React from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

import { AgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { WorkspaceType } from "@app/types";

const COLLAPSED_RIGHT_PANEL_SIZE = 3;
const MIN_EXPANDED_RIGHT_PANEL_SIZE = 20;
const DEFAULT_RIGHT_PANEL_SIZE = 30;

interface AgentBuilderLayoutProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  owner: WorkspaceType;
}

export function AgentBuilderLayout({
  leftPanel,
  rightPanel,
  owner,
}: AgentBuilderLayoutProps) {
  const { isPreviewPanelOpen, setIsPreviewPanelOpen } =
    useContext(AgentBuilderContext);
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
    <div className="flex h-full flex-row">
      <Head>
        <title>{`Dust - ${owner.name}`}</title>
      </Head>
      <div
        className={cn(
          "relative h-full w-full flex-1 flex-col overflow-x-hidden overflow-y-hidden",
          "bg-background text-foreground",
          "dark:bg-background-night dark:text-foreground-night"
        )}
      >
        <main className="flex h-full w-full flex-col items-center overflow-y-auto">
          {loaded && (
            <div className="flex h-full w-full">
              <ResizablePanelGroup
                id="agent-builder-layout"
                autoSaveId="agent-builder-layout"
                direction="horizontal"
                className="h-full w-full"
              >
                <ResizablePanel defaultSize={70} minSize={30}>
                  <div className="h-full w-full overflow-y-auto px-6">
                    {leftPanel}
                  </div>
                </ResizablePanel>

                <ResizableHandle
                  disabled={!isPreviewPanelOpen}
                  onDragging={(isDragging) => setIsResizing(isDragging)}
                />

                <ResizablePanel
                  ref={previewPanelRef}
                  id="preview-panel"
                  defaultSize={DEFAULT_RIGHT_PANEL_SIZE}
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
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
