import { ConversationContainerVirtuoso } from "@app/components/assistant/conversation/ConversationContainer";
import ConversationSidePanelContent from "@app/components/assistant/conversation/ConversationSidePanelContent";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { InputBarContextProvider } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { SubscriptionType } from "@app/types/plan";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { Button, MenuIcon } from "@dust-tt/sparkle";
import type { AttachSelectionMessage } from "@extension/platforms/chrome/messages";
import { usePlatform } from "@extension/shared/context/PlatformContext";
import { useFileUploaderService } from "@extension/ui/hooks/useFileUploaderService";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";

interface ConversationContainerProps {
  workspace: LightWorkspaceType;
  user: UserType;
  subscription: SubscriptionType;
  conversationId: string | null;
  conversation?: ConversationWithoutContentType;
  serverId?: string;
}

export const ConversationContainer = ({
  workspace,
  user,
  subscription,
  conversationId,
  conversation,
  serverId,
}: ConversationContainerProps) => {
  const platform = usePlatform();
  const { currentPanel } = useConversationSidePanelContext();
  const { setSidebarOpen } = useContext(SidebarContext);
  const fileUploaderService = useFileUploaderService(
    platform.capture,
    conversationId
  );

  const handleCapture = useCallback(
    (type: "text" | "screenshot") => {
      if (type === "text") {
        void fileUploaderService.uploadContentTab({
          includeContent: true,
          includeCapture: false,
        });
        return;
      }

      void fileUploaderService.uploadContentTab({
        includeContent: false,
        includeCapture: true,
      });
    },
    [fileUploaderService.uploadContentTab]
  );

  const captureActions = useMemo(
    () => ({
      onCapture: handleCapture,
      isCapturing: fileUploaderService.isCapturing,
    }),
    [handleCapture, fileUploaderService.isCapturing]
  );

  const clientSideMCPServerIds = useMemo(
    () => (serverId ? [serverId] : undefined),
    [serverId]
  );

  // Reset fileBlobs when conversationId changes.
  // We intentionally avoid using a key prop as it would remount
  // the entire page subtree just to reset a single array.
  const [prevConversationId, setPrevConversationId] = useState(conversationId);
  if (conversationId !== prevConversationId) {
    setPrevConversationId(conversationId);
    fileUploaderService.resetUpload();
  }

  useEffect(() => {
    void platform.messaging?.sendMessage({
      type: "INPUT_BAR_STATUS",
      available: true,
    });

    const cleanup = platform.messaging?.addMessageListener(
      (message: AttachSelectionMessage) => {
        if (message.type === "EXT_ATTACH_TAB") {
          void fileUploaderService.uploadContentTab(message);
        }
      }
    );

    return () => {
      void platform.messaging?.sendMessage({
        type: "INPUT_BAR_STATUS",
        available: false,
      });
      cleanup?.();
    };
  }, [platform.messaging, fileUploaderService.uploadContentTab]);

  return (
    <InputBarContextProvider
      captureActions={captureActions}
      fileUploaderService={fileUploaderService}
    >
      <div className={currentPanel ? "hidden" : "flex flex-col h-full w-full"}>
        <ConversationContainerVirtuoso
          owner={workspace}
          user={user}
          subscription={subscription}
          conversationId={conversationId}
          clientSideMCPServerIds={clientSideMCPServerIds}
        />
      </div>
      {conversation && currentPanel && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background dark:bg-background-night">
          {/* Hamburger button overlaid in the pl-14 area of AppLayoutTitle header */}
          <div className="absolute left-0 top-0 z-10 flex h-[58px] shrink-0 items-center px-2">
            <Button
              variant="ghost"
              icon={MenuIcon}
              onClick={() => setSidebarOpen(true)}
            />
          </div>
          <ConversationSidePanelContent
            owner={workspace}
            conversation={conversation}
            currentPanel={currentPanel}
          />
        </div>
      )}
    </InputBarContextProvider>
  );
};
