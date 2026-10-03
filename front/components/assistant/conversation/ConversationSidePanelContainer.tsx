import ConversationSidePanelContent from "@app/components/assistant/conversation/ConversationSidePanelContent";
import {
  useConversationSidePanelContext,
  useRegisterSidePanelConversation,
} from "@app/components/assistant/conversation/ConversationSidePanelContext";
import {
  CONVERSATION_MIN_WIDTH_PX,
  DEFAULT_RIGHT_PANEL_SIZE,
  getDefaultRightPanelSize,
  MIN_DOCKED_CONTAINER_WIDTH_PX,
} from "@app/components/assistant/conversation/constant";
import {
  NAVIGATION_REOPEN_CONVERSATION_WIDTH_PX,
  useFoldNavigationOnOvershoot,
} from "@app/components/assistant/conversation/useFoldNavigationOnOvershoot";
import { useElementWidth } from "@app/hooks/useElementWidth";
import { useHashParam } from "@app/hooks/useHashParams";
import { useLockDocumentScroll } from "@app/hooks/useLockDocumentScroll";
import {
  MOBILE_BREAKPOINT,
  useIsMobile,
  WidthConstrainedContext,
} from "@app/lib/swr/useIsMobile";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { FULL_SCREEN_HASH_PARAM } from "@app/types/conversation_side_panel";
import type { LightWorkspaceType } from "@app/types/user";
import { ResizableSidePanel } from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

const identity = (width: number) => width;

type ConversationWidthRange = "cramped" | "narrow" | "wide";
function toConversationWidthRange(width: number): ConversationWidthRange {
  if (width < NAVIGATION_REOPEN_CONVERSATION_WIDTH_PX) {
    return "cramped";
  }
  return width < MOBILE_BREAKPOINT ? "narrow" : "wide";
}

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

  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const containerWidth = useElementWidth(container, identity);
  const [conversationElement, setConversationElement] =
    useState<HTMLDivElement | null>(null);
  const conversationWidthRange = useElementWidth(
    conversationElement,
    toConversationWidthRange
  );
  const onConversationSqueezed = useFoldNavigationOnOvershoot({
    conversationElement,
    hasRoomForNavigation: conversationWidthRange !== "cramped",
  });

  const isMobile = useIsMobile();
  // The panel switches to the mobile layout when it has no room to dock, whatever the screen width.
  const isMobileLayout =
    isMobile || containerWidth < MIN_DOCKED_CONTAINER_WIDTH_PX;
  const isPanelOpen = !!currentPanel && !!conversation;
  const isMobilePanelOpen = isMobileLayout && isPanelOpen;

  useLockDocumentScroll(isMobilePanelOpen);

  useEffect(() => {
    if (isMobileLayout) {
      setPanelRef(null);
      return;
    }

    setPanelRef(panelRef.current);
  }, [isMobileLayout, setPanelRef]);

  if (isMobileLayout) {
    return (
      <div ref={setContainer} className="relative flex w-full flex-col">
        {/* The mobile layout implies a conversation narrower than the mobile breakpoint. */}
        <WidthConstrainedContext.Provider value>
          {children}
        </WidthConstrainedContext.Provider>
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
    <div ref={setContainer} className="flex min-h-0 flex-1 flex-col">
      <ResizableSidePanel
        ref={panelRef}
        isOpen={isPanelOpen}
        defaultSize={
          currentPanel
            ? getDefaultRightPanelSize(currentPanel)
            : DEFAULT_RIGHT_PANEL_SIZE
        }
        // Full screen grows the panel to 100%, so it lifts the conversation minimum.
        minContentSize={
          isFullScreen
            ? 0
            : Math.min((CONVERSATION_MIN_WIDTH_PX * 100) / containerWidth, 100)
        }
        isResizable={!isFullScreen}
        // Fires once the drag reaches the conversation minimum width (the divider clamps there).
        minContentWidthPx={CONVERSATION_MIN_WIDTH_PX + 1}
        onContentSqueezed={onConversationSqueezed}
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
        <div ref={setConversationElement} className="flex h-panel flex-col">
          <WidthConstrainedContext.Provider
            value={conversationWidthRange !== "wide"}
          >
            {children}
          </WidthConstrainedContext.Provider>
        </div>
      </ResizableSidePanel>
    </div>
  );
}
