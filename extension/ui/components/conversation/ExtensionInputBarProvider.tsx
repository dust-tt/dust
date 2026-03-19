import { InputBarContextProvider } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import type { LightWorkspaceType } from "@app/types/user";
import type { AttachSelectionMessage } from "@extension/platforms/chrome/messages";
import { usePlatform } from "@extension/shared/context/PlatformContext";
import { useFileUploaderService } from "@extension/ui/hooks/useFileUploaderService";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

interface ExtensionInputBarProviderProps {
  workspace: LightWorkspaceType;
  conversationId?: string | null;
  children: ReactNode;
}

export function ExtensionInputBarProvider({
  workspace,
  conversationId = null,
  children,
}: ExtensionInputBarProviderProps) {
  const platform = usePlatform();
  const fileUploaderService = useFileUploaderService(
    platform.capture,
    conversationId
  );

  const captureActions = platform.useCaptureActions(
    workspace,
    fileUploaderService.uploadContentTab,
    fileUploaderService.isCapturing
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
      {children}
    </InputBarContextProvider>
  );
}
