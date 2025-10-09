import { cn, ResizableHandle, ResizablePanel } from "@dust-tt/sparkle";
import { useEffect, useRef } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

import { DEFAULT_RIGHT_PANEL_SIZE } from "@app/components/assistant/conversation/constant";
import ConversationSidePanelContent from "@app/components/assistant/conversation/ConversationSidePanelContent";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type {
  ConversationWithoutContentType,
  LightWorkspaceType,
} from "@app/types";

interface ConversationSidePanelContainerProps {
  conversation: ConversationWithoutContentType | null;
  owner: LightWorkspaceType;
}

export default function ConversationSidePanelContainer({
  conversation,
  owner,
}: ConversationSidePanelContainerProps) {
  const { currentPanel, setPanelRef, onPanelClosed } =
    useConversationSidePanelContext();
  const panelRef = useRef<ImperativePanelHandle | null>(null);

  const isMobile = useIsMobile();

  useEffect(() => {
    setPanelRef(panelRef.current);
  }, [setPanelRef]);

  useEffect(() => {
    if (!currentPanel || !panelRef.current) {
      return;
    }

    panelRef.current?.expand(DEFAULT_RIGHT_PANEL_SIZE);
  }, [currentPanel]);

  return (
    <>
      {/* Resizable Handle for Panels - Only show on desktop */}
      {currentPanel && !isMobile && (
        <ResizableHandle withHandle className="z-50" />
      )}
      {/* Panel Container - either Interactive Content or Actions */}
      <ResizablePanel
        ref={panelRef}
        minSize={20}
        defaultSize={0}
        onTransitionEnd={() => {
          if (panelRef.current?.isCollapsed()) {
            onPanelClosed();
          }
        }}
        collapsible
        collapsedSize={0}
        className={cn(
          // Smooth transition animation similar to sidebar
          "flex-0 overflow-hidden transition-all duration-300 ease-out",
          !currentPanel && "hidden w-0 md:block",
          // On mobile: overlay full screen with absolute positioning.
          "md:relative",
          currentPanel && "absolute inset-0 md:relative md:inset-auto"
        )}
      >
        {currentPanel && conversation && (
          <ConversationSidePanelContent
            conversation={conversation}
            owner={owner}
            currentPanel={currentPanel}
          />
        )}
      </ResizablePanel>
    </>
  );
}
