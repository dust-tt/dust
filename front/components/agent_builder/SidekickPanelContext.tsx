import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import { useSidekickFirstMessage } from "@app/hooks/useSidekickFirstMessage";
import { useAuth } from "@app/lib/auth/AuthContext";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { TemplateInfo } from "@app/types/assistant/templates";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

interface SidekickPanelContextType {
  conversation: ConversationType | null;
  isCreatingConversation: boolean;
  creationFailed: boolean;
  startConversation: () => Promise<void>;
  resetConversation: () => void;
  clientSideMCPServerIds: string[];
  conversationId?: string;
}

const SidekickPanelContext = createContext<
  SidekickPanelContextType | undefined
>(undefined);

export const useSidekickPanelContext = () => {
  const context = useContext(SidekickPanelContext);
  if (!context) {
    throw new Error(
      "useSidekickPanelContext must be used within a SidekickPanelProvider"
    );
  }
  return context;
};

interface SidekickPanelProviderProps {
  children: ReactNode;
  targetAgentConfigurationId: string | null;
  targetAgentConfigurationVersion: number;
  clientSideMCPServerIds: string[];
  isNewAgent: boolean;
  isDuplicate?: boolean;
  templateInfo?: TemplateInfo;
  conversationId?: string;
}

export const SidekickPanelProvider = ({
  children,
  targetAgentConfigurationId,
  targetAgentConfigurationVersion,
  clientSideMCPServerIds,
  isNewAgent,
  isDuplicate = false,
  templateInfo,
  conversationId,
}: SidekickPanelProviderProps) => {
  const { owner } = useAgentBuilderContext();
  const { user } = useAuth();
  const sendNotification = useSendNotification();

  const [conversation, setConversation] = useState<ConversationType | null>(
    null
  );
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [creationFailed, setCreationFailed] = useState(false);
  const hasStartedRef = useRef(false);

  const { getFirstMessage, useCase } = useSidekickFirstMessage({
    owner,
    isNewAgent,
    isDuplicate,
    templateInfo,
    conversationId,
    agentConfigurationId: targetAgentConfigurationId ?? undefined,
  });

  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });

  const startConversation = useCallback(async () => {
    if (hasStartedRef.current || !targetAgentConfigurationId) {
      return;
    }

    // Wait for the client-side MCP server to be registered before starting
    // the conversation. Without this, the sidekick won't have access to
    // agent_builder_sidekick_client tools like get_agent_config.
    if (clientSideMCPServerIds.length === 0) {
      return;
    }
    hasStartedRef.current = true;

    setIsCreatingConversation(true);

    const firstMessageResult = await getFirstMessage();
    if (firstMessageResult.isErr()) {
      setCreationFailed(true);
      setIsCreatingConversation(false);
      sendNotification({
        title: "Sidekick error",
        description: firstMessageResult.error.message,
        type: "error",
      });
      return;
    }

    const result = await createConversationWithMessage({
      messageData: {
        input: firstMessageResult.value,
        mentions: [{ configurationId: GLOBAL_AGENTS_SID.SIDEKICK }],
        contentFragments: { uploaded: [], contentNodes: [] },
        origin: "agent_sidekick",
        clientSideMCPServerIds,
      },
      // TODO(sidekick 2026-01-23): same visibility as the 'Preview' tab conversation.
      // We should rename it.
      visibility: "test",
      title: `Sidekick conversation (useCase: ${useCase}, agentId: ${targetAgentConfigurationId})`,
      metadata: {
        sidekickTargetAgentConfigurationId: targetAgentConfigurationId,
        sidekickTargetAgentConfigurationVersion:
          targetAgentConfigurationVersion,
        sidekickIsNewAgentFromScratch: useCase === "new",
      },
      skipToolsValidation: true,
    });

    if (result.isOk()) {
      setConversation(result.value);
    } else {
      setCreationFailed(true);
      sendNotification({
        title: result.error.title,
        description: result.error.message,
        type: "error",
      });
    }

    setIsCreatingConversation(false);
  }, [
    clientSideMCPServerIds,
    createConversationWithMessage,
    getFirstMessage,
    useCase,
    sendNotification,
    targetAgentConfigurationId,
    targetAgentConfigurationVersion,
  ]);

  const resetConversation = useCallback(() => {
    hasStartedRef.current = false;
    setConversation(null);
    setCreationFailed(false);
  }, []);

  const value: SidekickPanelContextType = useMemo(
    () => ({
      conversation,
      isCreatingConversation,
      creationFailed,
      startConversation,
      resetConversation,
      clientSideMCPServerIds,
    }),
    [
      clientSideMCPServerIds,
      conversation,
      isCreatingConversation,
      creationFailed,
      startConversation,
      resetConversation,
    ]
  );

  return (
    <SidekickPanelContext.Provider value={value}>
      {children}
    </SidekickPanelContext.Provider>
  );
};

SidekickPanelProvider.displayName = "SidekickPanelProvider";
