import { ConversationContainerVirtuoso } from "@app/components/assistant/conversation/ConversationContainer";
import ConversationSidePanelContent from "@app/components/assistant/conversation/ConversationSidePanelContent";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { InputBarContextProvider } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { SubscriptionType } from "@app/types/plan";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { usePlatform } from "@extension/shared/context/PlatformContext";
import { useFileUploaderService } from "@extension/ui/hooks/useFileUploaderService";
import { useCallback, useMemo, useState } from "react";

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

  return (
    <InputBarContextProvider
      origin="extension"
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
      {conversation && (
        <ConversationSidePanelContent
          owner={workspace}
          conversation={conversation}
          currentPanel={currentPanel}
        />
      )}
    </InputBarContextProvider>
  );
};
