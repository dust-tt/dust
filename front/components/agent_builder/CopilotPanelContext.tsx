import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useCopilotFirstMessage } from "@app/hooks/useCopilotFirstMessage";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import { useAuth } from "@app/lib/auth/AuthContext";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { TemplateInfo } from "@app/types/assistant/templates";
import type { ReactNode } from "react";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

interface CopilotPanelContextType {
  conversation: ConversationType | null;
  isCreatingConversation: boolean;
  creationFailed: boolean;
  startConversation: () => Promise<void>;
  resetConversation: () => void;
  clientSideMCPServerIds: string[];
  conversationId?: string;
}

const CopilotPanelContext = createContext<CopilotPanelContextType | undefined>(
  undefined
);

export const useCopilotPanelContext = () => {
  const context = useContext(CopilotPanelContext);
  if (!context) {
    throw new Error(
      "useCopilotPanelContext must be used within a CopilotPanelProvider"
    );
  }
  return context;
};

interface CopilotPanelProviderProps {
  children: ReactNode;
  targetAgentConfigurationId: string | null;
  targetAgentConfigurationVersion: number;
  clientSideMCPServerIds: string[];
  isNewAgent: boolean;
  templateInfo?: TemplateInfo;
  conversationId?: string;
}

export const CopilotPanelProvider = ({
  children,
  targetAgentConfigurationId,
  targetAgentConfigurationVersion,
  clientSideMCPServerIds,
  isNewAgent,
  templateInfo,
  conversationId,
}: CopilotPanelProviderProps) => {
  const { owner } = useAgentBuilderContext();
  const { user } = useAuth();
  const sendNotification = useSendNotification();

  const [conversation, setConversation] = useState<ConversationType | null>(
    null
  );
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [creationFailed, setCreationFailed] = useState(false);
  const hasStartedRef = useRef(false);

  const { getFirstMessage } = useCopilotFirstMessage({
    owner,
    isNewAgent,
    templateInfo,
    conversationId,
  });

  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });

  const startConversation = useCallback(async () => {
    if (hasStartedRef.current) {
      return;
    }

    // For existing agents (not new), require a target agent configuration ID.
    // For new agents in shrink-wrap flow (with conversationId), allow null targetAgentConfigurationId
    // since the agent is being created and doesn't exist yet.
    if (!isNewAgent && !targetAgentConfigurationId) {
      return;
    }
    // Wait for the client-side MCP server to be registered before starting
    // the conversation. Without this, the copilot won't have access to
    // agent_builder_copilot_client tools like get_agent_config.
    if (clientSideMCPServerIds.length === 0) {
      return;
    }
    hasStartedRef.current = true;

    setIsCreatingConversation(true);

    const firstMessagePrompt = await getFirstMessage();

    const result = await createConversationWithMessage({
      messageData: {
        input: firstMessagePrompt,
        mentions: [{ configurationId: GLOBAL_AGENTS_SID.COPILOT }],
        contentFragments: { uploaded: [], contentNodes: [] },
        origin: "agent_copilot",
        clientSideMCPServerIds,
      },
      // TODO(copilot 2026-01-23): same visibility as the 'Preview' tab conversation.
      // We should rename it.
      visibility: "test",
      metadata: {
        copilotTargetAgentConfigurationId: targetAgentConfigurationId,
        copilotTargetAgentConfigurationVersion: targetAgentConfigurationVersion,
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
    isNewAgent,
    sendNotification,
    targetAgentConfigurationId,
    targetAgentConfigurationVersion,
  ]);

  const resetConversation = useCallback(() => {
    hasStartedRef.current = false;
    setConversation(null);
    setCreationFailed(false);
  }, []);

  const value: CopilotPanelContextType = useMemo(
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
    <CopilotPanelContext.Provider value={value}>
      {children}
    </CopilotPanelContext.Provider>
  );
};

CopilotPanelProvider.displayName = "CopilotPanelProvider";
