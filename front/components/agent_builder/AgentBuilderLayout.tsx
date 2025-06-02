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

import { CONVERSATION_PARENT_SCROLL_DIV_ID } from "@app/components/assistant/conversation/lib";
import type { WorkspaceType } from "@app/types";

import { AgentBuilderContext } from "./AgentBuilderContext";

const MIN_RIGHT_PANEL_SIZE = 4;
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
  const { isPreviewPanelOpen } = useContext(AgentBuilderContext);
  const previewPanelRef = useRef<ImperativePanelHandle>(null);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (previewPanelRef.current) {
      if (isPreviewPanelOpen) {
        previewPanelRef.current.resize(DEFAULT_RIGHT_PANEL_SIZE);
      } else {
        previewPanelRef.current.resize(MIN_RIGHT_PANEL_SIZE);
      }
    }
  }, [isPreviewPanelOpen]);

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
        <main
          id={CONVERSATION_PARENT_SCROLL_DIV_ID.page}
          className="flex h-full w-full flex-col items-center overflow-y-auto"
        >
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
                onDragging={(isDragging) => setIsResizing(isDragging)}
              />

              <ResizablePanel
                ref={previewPanelRef}
                id="preview-panel"
                defaultSize={DEFAULT_RIGHT_PANEL_SIZE}
                minSize={MIN_RIGHT_PANEL_SIZE}
                collapsible={true}
                className={
                  !isResizing
                    ? "overflow-hidden transition-all duration-300 ease-in-out"
                    : "overflow-hidden"
                }
              >
                <div className="h-full w-full overflow-y-auto px-6">
                  {rightPanel}
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </main>
      </div>
    </div>
  );
}
