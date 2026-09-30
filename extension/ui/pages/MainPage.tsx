import { BlockedActionsProvider } from "@app/components/assistant/conversation/BlockedActionsProvider";
import {
  ConversationMenu,
  useConversationMenu,
} from "@app/components/assistant/conversation/ConversationMenu";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { useConversation } from "@app/hooks/conversations/useConversation";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useSetupNotifications } from "@app/hooks/useSetupNotifications";
import { useAuth } from "@app/lib/auth/AuthContext";
import { getPodRoute } from "@app/lib/utils/router";
import { Attachment01, Button, DotsHorizontal } from "@dust-tt/sparkle";
import type { PanelStateResponse } from "@extension/shared/messages";
import { ConversationLayout } from "@extension/ui/components/conversation/ConversationLayout";
import { UserDropdownMenu } from "@extension/ui/components/navigation/UserDropdownMenu";
import { useEffect, useMemo } from "react";
import { ConversationContainer } from "../components/conversation/ConversationContainer";

export const MainPage = () => {
  const { user, workspace, subscription } = useAuth();
  useSetupNotifications();
  const isMac = /macintosh|mac os x/i.test(navigator.userAgent);
  const shortcut = isMac ? "⇧⌘E" : "⇧+Ctrl+E";

  const conversationId = useActiveConversationId();
  const { openPanel } = useConversationSidePanelContext();

  const { conversation, isConversationLoading, conversationError } =
    useConversation({
      conversationId: conversationId,
      workspaceId: workspace.sId,
    });

  useEffect(() => {
    const onGetPanelState = (
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => {
      if (
        typeof message !== "object" ||
        message === null ||
        !("type" in message) ||
        message.type !== "EXT_GET_PANEL_STATE" ||
        !("windowId" in message) ||
        typeof message.windowId !== "number"
      ) {
        return false;
      }

      void chrome.windows.getCurrent().then((currentWindow) => {
        if (currentWindow.id !== message.windowId) {
          return;
        }

        const response: PanelStateResponse = {
          status:
            conversationId && isConversationLoading ? "loading" : "open",
          workspaceId: workspace.sId,
          conversationId,
          podId: conversation?.spaceId ?? null,
        };
        sendResponse(response);
      }).catch(() => sendResponse({ status: "unknown" }));
      return true;
    };

    chrome.runtime.onMessage.addListener(onGetPanelState);
    return () => chrome.runtime.onMessage.removeListener(onGetPanelState);
  }, [
    conversation?.spaceId,
    conversationId,
    isConversationLoading,
    workspace.sId,
  ]);

  const {
    isMenuOpen,
    isMenuOpenOrClosing,
    menuTriggerPosition,
    handleMenuPhaseChange,
  } = useConversationMenu();

  const headerTitle = useMemo(() => {
    if (!conversationId) {
      return "";
    }
    if (isConversationLoading) {
      return "...";
    }
    if (conversationError) {
      return "Error loading conversation";
    }
    return conversation?.title || "Conversation";
  }, [conversation, isConversationLoading, conversationId, conversationError]);

  return (
    <ConversationLayout
      title={headerTitle}
      backHref={
        conversation?.spaceId
          ? getPodRoute(workspace.sId, conversation.spaceId)
          : undefined
      }
      rightActions={
        conversationId ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              label="Files"
              icon={Attachment01}
              variant="ghost"
              onClick={() => openPanel({ type: "files" })}
            />
            <ConversationMenu
              activeConversationId={conversationId}
              conversation={conversation}
              owner={workspace}
              trigger={
                <Button
                  size="sm"
                  variant="ghost"
                  icon={DotsHorizontal}
                  aria-label="Conversation menu"
                />
              }
              isConversationDisplayed={true}
              isOpen={isMenuOpen}
              isOpenOrClosing={isMenuOpenOrClosing}
              onPhaseChange={handleMenuPhaseChange}
              triggerPosition={menuTriggerPosition}
              displayOpenInBrowser
              openDetailsInNewTab
            />
          </div>
        ) : (
          <div className="items-right flex flex-row space-x-1">
            <UserDropdownMenu />
          </div>
        )
      }
    >
      {!conversationId && (
        <div className="element fixed bottom-0 right-0 z-10 p-2 text-sm">
          <p className="text-muted-foreground text-sm font-normal">
            {shortcut}
          </p>
        </div>
      )}
      <BlockedActionsProvider owner={workspace} conversation={conversation}>
        <GenerationContextProvider>
          <ConversationContainer
            workspace={workspace}
            user={user}
            subscription={subscription}
            conversationId={conversationId}
            conversation={conversation}
          />
        </GenerationContextProvider>
      </BlockedActionsProvider>
    </ConversationLayout>
  );
};
