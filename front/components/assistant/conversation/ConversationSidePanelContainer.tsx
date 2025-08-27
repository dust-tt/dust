import { cn, ResizableHandle, ResizablePanel } from "@dust-tt/sparkle";
import { useEffect, useRef } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

import ConversationSidePanelContent from "@app/components/assistant/conversation/ConversationSidePanelContent";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
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

  useEffect(() => {
    setPanelRef(panelRef.current);
  }, [setPanelRef]);

  useEffect(() => {
    if (!currentPanel || !panelRef.current) {
      return;
    }

    panelRef.current?.expand(40);
  }, [currentPanel]);

  return (
    <>
      {/* Resizable Handle for Panels */}
      <ResizableHandle
        className={cn(
          "hidden transition-all duration-300 ease-out md:block",
          !currentPanel && "translate-x-full opacity-0"
        )}
        disabled={!currentPanel}
      />
      {/* Panel Container - either Canvas or Actions */}
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
        {currentPanel && (
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
