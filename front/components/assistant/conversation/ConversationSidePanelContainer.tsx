import { cn, ResizableHandle, ResizablePanel } from "@dust-tt/sparkle";

import ConversationSidePanelContent from "@app/components/assistant/conversation/ConversationSidePanelContent";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { ConversationType, LightWorkspaceType } from "@app/types";

interface ConversationSidePanelContainerProps {
  conversation: ConversationType | null;
  owner: LightWorkspaceType;
}

export default function ConversationSidePanelContainer({
  conversation,
  owner,
}: ConversationSidePanelContainerProps) {
  const { currentPanel } = useConversationSidePanelContext();

  return (
    <>
      {/* Resizable Handle for Panels */}
      {currentPanel && <ResizableHandle className="hidden md:block" />}

      {/* Panel Container - either Interactive Content or Actions */}
      {currentPanel && (
        <ResizablePanel
          minSize={20}
          defaultSize={70}
          className={cn(
            !currentPanel && "hidden",
            // On mobile: overlay full screen with absolute positioning.
            "md:relative",
            currentPanel && "absolute inset-0 md:relative md:inset-auto"
          )}
        >
          <ConversationSidePanelContent
            conversation={conversation}
            owner={owner}
            currentPanel={currentPanel}
          />
        </ResizablePanel>
      )}
    </>
  );
}
