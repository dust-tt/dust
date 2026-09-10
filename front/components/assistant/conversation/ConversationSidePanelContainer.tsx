import ConversationSidePanelContent from "@app/components/assistant/conversation/ConversationSidePanelContent";
import {
  useConversationSidePanelContext,
  useRegisterSidePanelConversation,
} from "@app/components/assistant/conversation/ConversationSidePanelContext";
import {
  DEFAULT_RIGHT_PANEL_SIZE,
  getDefaultRightPanelSize,
} from "@app/components/assistant/conversation/constant";
import { useHashParam } from "@app/hooks/useHashParams";
import { useLockDocumentScroll } from "@app/hooks/useLockDocumentScroll";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { FULL_SCREEN_HASH_PARAM } from "@app/types/conversation_side_panel";
import type { LightWorkspaceType } from "@app/types/user";
import { ResizableSidePanel } from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

interface ConversationSidePanelContainerProps {
  children: ReactNode;
  conversation?: ConversationWithoutContentType;
  owner: LightWorkspaceType;
}

export default function ConversationSidePanelContainer({
  children,
  conversation,
  owner,
}: ConversationSidePanelContainerProps) {
  const { currentPanel, setPanelRef, onPanelClosed } =
    useConversationSidePanelContext();
  useRegisterSidePanelConversation(!!conversation);
  const panelRef = useRef<ImperativePanelHandle | null>(null);
  const [fullScreenHash] = useHashParam(FULL_SCREEN_HASH_PARAM);
  const isFullScreen = fullScreenHash === "true";

  const isMobile = useIsMobile();
  const isPanelOpen = !!currentPanel && !!conversation;
  const isMobilePanelOpen = isMobile && isPanelOpen;

  useLockDocumentScroll(isMobilePanelOpen);

  useEffect(() => {
    if (isMobile) {
      setPanelRef(null);
      return;
    }

    setPanelRef(panelRef.current);
  }, [isMobile, setPanelRef]);

  if (isMobile) {
    return (
      <div className="relative flex w-full flex-col">
        {children}
        {isPanelOpen && (
          <div className="fixed inset-0 z-50 flex flex-col overflow-hidden overscroll-none bg-panel-background">
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
              <ConversationSidePanelContent
                conversation={conversation}
                owner={owner}
                currentPanel={currentPanel}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <ResizableSidePanel
      ref={panelRef}
      isOpen={isPanelOpen}
      defaultSize={
        currentPanel
          ? getDefaultRightPanelSize(currentPanel)
          : DEFAULT_RIGHT_PANEL_SIZE
      }
      minContentSize={0}
      isResizable={!isFullScreen}
      onCollapse={onPanelClosed}
      panel={
        isPanelOpen &&
        currentPanel && (
          <ConversationSidePanelContent
            conversation={conversation}
            owner={owner}
            currentPanel={currentPanel}
          />
        )
      }
    >
      <div className="flex h-panel flex-col">{children}</div>
    </ResizableSidePanel>
  );
}
