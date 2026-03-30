import {
  InputBarContext,
  InputBarContextProvider,
} from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { toRichAgentMentionType } from "@app/types/assistant/mentions";
import type { LightWorkspaceType } from "@app/types/user";
import { usePlatform } from "@extension/shared/context/PlatformContext";
import type { AttachSelectionMessage } from "@extension/shared/messages";
import { useSearchParam } from "@extension/shared/platform";
import { useFileUploaderService } from "@extension/ui/hooks/useFileUploaderService";
import type { ReactNode } from "react";
import { useContext, useEffect, useState } from "react";

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
      <AgentQueryParamHandler workspaceId={workspace.sId} />
      {children}
    </InputBarContextProvider>
  );
}

/**
 * Reads the ?agent= query param and pre-selects the agent in the input bar.
 */
function AgentQueryParamHandler({ workspaceId }: { workspaceId: string }) {
  const agent = useSearchParam("agent");
  const { setSelectedAgent } = useContext(InputBarContext);

  const { agentConfiguration } = useAgentConfiguration({
    workspaceId,
    agentConfigurationId: agent,
  });

  useEffect(() => {
    if (agentConfiguration) {
      setSelectedAgent(toRichAgentMentionType(agentConfiguration));
    }
  }, [agentConfiguration, setSelectedAgent]);

  return null;
}
