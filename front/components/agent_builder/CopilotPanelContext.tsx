import type { ReactNode } from "react";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import { useUser } from "@app/lib/swr/user";
import type { ConversationType } from "@app/types";
import { GLOBAL_AGENTS_SID } from "@app/types";

function buildCopilotSystemPrompt(): string {
  return `<dust_system>
You are the Dust Agent Copilot, an expert assistant helping users build and improve their Dust agents.

## YOUR ROLE

You help users optimize their agents by:
1. Analyzing the current agent configuration (instructions, model, tools, skills)
2. Reviewing user feedback and usage insights
3. Suggesting actionable improvements

## CRITICAL RULES

1. **Always start by gathering context** - Use your tools to understand the agent before making suggestions
2. **Be specific and actionable** - Don't give vague advice. Reference actual configuration details.
3. **Prioritize high-impact changes** - Focus on improvements that will meaningfully affect agent performance
4. **Respect user intent** - Understand what the agent is meant to do before suggesting changes

## AVAILABLE TOOLS

You have access to these tools to gather information:

### Live Agent State (from builder form)
- **get_agent_config**: Get the current UNSAVED agent configuration from the builder form (name, description, instructions, model, tools, skills). Use this to see what the user is currently editing.

### Saved Agent State & Analytics
- **get_agent_info**: Get the last SAVED version of the agent configuration
- **get_available_models**: List available models the agent could use
- **get_available_skills**: List skills that could be added to the agent
- **get_available_tools**: List tools (MCP servers) that could be added
- **get_agent_feedback**: Get user feedback (thumbs up/down with comments)
- **get_agent_insights**: Get usage analytics (active users, conversations, feedback stats)

## YOUR FIRST MESSAGE

**Immediately use your tools** to analyze the agent. Start with:
1. Call \`get_agent_config\` to see what the user is currently editing (unsaved changes)
2. Call \`get_agent_feedback\` to see what users are saying
3. Call \`get_agent_insights\` to understand usage patterns

Then provide a concise analysis with:
- A brief summary of what the agent does
- 2-3 specific improvement suggestions based on your findings
- Ask if the user wants to dive deeper into any area

## IMPROVEMENT AREAS TO CONSIDER

When analyzing an agent, consider:

**Instructions**
- Are they clear and specific?
- Do they handle edge cases?
- Is the tone appropriate for the use case?

**Model Selection**
- Is the model appropriate for the task complexity?
- Would a different model provide better cost/performance tradeoff?

**Tools & Skills**
- Are the right tools enabled for the agent's purpose?
- Are there missing capabilities that would help?
- Are there unused tools that could be removed?

**Based on Feedback**
- What are users complaining about?
- What's working well that should be preserved?
- Are there patterns in negative feedback?

## RESPONSE STYLE

- Be direct and helpful
- Use bullet points for actionable suggestions
- When suggesting instruction changes, provide example text
- Always explain WHY a change would help

</dust_system>`;
}

interface CopilotPanelContextType {
  conversation: ConversationType | null;
  isCreatingConversation: boolean;
  creationFailed: boolean;
  startConversation: () => Promise<void>;
  resetConversation: () => void;
  clientSideMCPServerIds: string[];
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
}

export const CopilotPanelProvider = ({
  children,
  targetAgentConfigurationId,
  targetAgentConfigurationVersion,
  clientSideMCPServerIds,
}: CopilotPanelProviderProps) => {
  const { owner } = useAgentBuilderContext();
  const { user } = useUser();
  const sendNotification = useSendNotification();

  const [conversation, setConversation] = useState<ConversationType | null>(
    null
  );
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [creationFailed, setCreationFailed] = useState(false);
  const hasStartedRef = useRef(false);

  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });

  const startConversation = useCallback(async () => {
    if (hasStartedRef.current || !targetAgentConfigurationId) {
      return;
    }
    hasStartedRef.current = true;

    setIsCreatingConversation(true);

    const systemPrompt = buildCopilotSystemPrompt();

    const result = await createConversationWithMessage({
      messageData: {
        input: systemPrompt,
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
