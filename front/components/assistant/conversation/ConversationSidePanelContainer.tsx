import ConversationSidePanelContent from "@app/components/assistant/conversation/ConversationSidePanelContent";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { DEFAULT_RIGHT_PANEL_SIZE } from "@app/components/assistant/conversation/constant";
import { useHashParam } from "@app/hooks/useHashParams";
import { useLockDocumentScroll } from "@app/hooks/useLockDocumentScroll";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { FULL_SCREEN_HASH_PARAM } from "@app/types/conversation_side_panel";
import type { LightWorkspaceType } from "@app/types/user";
import { cn, ResizableHandle, ResizablePanel } from "@dust-tt/sparkle";
import { useEffect, useRef } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

interface ConversationSidePanelContainerProps {
  conversation?: ConversationWithoutContentType;
  owner: LightWorkspaceType;
}

export default function ConversationSidePanelContainer({
  conversation,
  owner,
}: ConversationSidePanelContainerProps) {
  const { currentPanel, setPanelRef, onPanelClosed } =
    useConversationSidePanelContext();
  const panelRef = useRef<ImperativePanelHandle | null>(null);
  const [fullScreenHash] = useHashParam(FULL_SCREEN_HASH_PARAM);
  const isFullScreen = fullScreenHash === "true";

  const isMobile = useIsMobile();
  const isMobilePanelOpen = isMobile && !!currentPanel;

  useLockDocumentScroll(isMobilePanelOpen);

  useEffect(() => {
    if (isMobile) {
      setPanelRef(null);
      return;
    }

    setPanelRef(panelRef.current);
  }, [isMobile, setPanelRef]);

  useEffect(() => {
    if (isMobile || !currentPanel || !panelRef.current) {
      return;
    }

    panelRef.current?.expand(DEFAULT_RIGHT_PANEL_SIZE);
  }, [currentPanel, isMobile]);

  if (isMobile) {
    if (!currentPanel || !conversation) {
      return null;
    }

    return (
      <div className="fixed inset-0 z-50 flex flex-col overflow-hidden overscroll-none bg-panel-background dark:bg-panel-background-night">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          <ConversationSidePanelContent
            conversation={conversation}
            owner={owner}
            currentPanel={currentPanel}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      {!!conversation && (
        <ResizableHandle
          withHandle={currentPanel && !isFullScreen}
          disabled={!currentPanel || isFullScreen}
          className="z-50"
        />
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
          currentPanel &&
            "absolute inset-0 bg-panel-background dark:bg-panel-background-night md:relative md:inset-auto"
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
