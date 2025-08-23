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
  const { currentPanel, setPanelRef } = useConversationSidePanelContext();
  const panelRef = useRef<ImperativePanelHandle | null>(null);

  useEffect(() => {
    setPanelRef(panelRef.current);
  }, [setPanelRef]);

  useEffect(() => {
    if (!currentPanel || !panelRef.current) {
      return;
    }
  }, [currentPanel]);

  return (
    <>
      {/* Resizable Handle for Panels */}
      {/* Panel Container - either Interactive Content or Actions */}
      <div
        className={cn(
          // Smooth transition animation similar to sidebar
          "flex-0 overflow-hidden rounded-xl bg-background shadow-lg transition-all duration-300 ease-out",
          !currentPanel && "hidden w-0 md:block",
          currentPanel && "w-100",
          "md:relative"
        )}
      >
        {currentPanel && (
          <ConversationSidePanelContent
            conversation={conversation}
            owner={owner}
            currentPanel={currentPanel}
          />
        )}
      </div>
    </>
  );
}
