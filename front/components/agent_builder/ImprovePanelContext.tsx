import type { ReactNode } from "react";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
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

### Agent State
- **get_agent_info**: Get the current agent's name, description, instructions, model settings, tools, and skills

### Context & Analytics
- **get_available_models**: List available models the agent could use
- **get_available_skills**: List skills that could be added to the agent
- **get_available_tools**: List tools (MCP servers) that could be added
- **get_agent_feedback**: Get user feedback (thumbs up/down with comments)
- **get_agent_insights**: Get usage analytics (active users, conversations, feedback stats)

## YOUR FIRST MESSAGE

**Immediately use your tools** to analyze the agent. Start with:
1. Call \`get_agent_info\` to understand the current configuration
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

interface ImprovePanelContextType {
  conversation: ConversationType | null;
  isCreatingConversation: boolean;
  startConversation: () => Promise<void>;
  resetConversation: () => void;
}

const ImprovePanelContext = createContext<ImprovePanelContextType | undefined>(
  undefined
);

export const useImprovePanelContext = () => {
  const context = useContext(ImprovePanelContext);
  if (!context) {
    throw new Error(
      "useImprovePanelContext must be used within an ImprovePanelProvider"
    );
  }
  return context;
};

interface ImprovePanelProviderProps {
  children: ReactNode;
}

export const ImprovePanelProvider = ({
  children,
}: ImprovePanelProviderProps) => {
  const { owner } = useAgentBuilderContext();
  const { user } = useUser();
  const sendNotification = useSendNotification();

  const [conversation, setConversation] = useState<ConversationType | null>(
    null
  );
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);

  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });

  const startConversation = useCallback(async () => {
    if (conversation || isCreatingConversation) {
      return;
    }

    setIsCreatingConversation(true);

    const systemPrompt = buildCopilotSystemPrompt();

    const result = await createConversationWithMessage({
      messageData: {
        input: systemPrompt,
        mentions: [{ configurationId: GLOBAL_AGENTS_SID.DUST }],
        contentFragments: { uploaded: [], contentNodes: [] },
        origin: "agent_copilot",
      },
      visibility: "unlisted",
    });

    if (result.isOk()) {
      setConversation(result.value);
    } else {
      sendNotification({
        title: result.error.title,
        description: result.error.message,
        type: "error",
      });
    }

    setIsCreatingConversation(false);
  }, [
    conversation,
    isCreatingConversation,
    createConversationWithMessage,
    sendNotification,
  ]);

  const resetConversation = useCallback(() => {
    setConversation(null);
  }, []);

  const value: ImprovePanelContextType = useMemo(
    () => ({
      conversation,
      isCreatingConversation,
      startConversation,
      resetConversation,
    }),
    [conversation, isCreatingConversation, startConversation, resetConversation]
  );

  return (
    <ImprovePanelContext.Provider value={value}>
      {children}
    </ImprovePanelContext.Provider>
  );
};

ImprovePanelProvider.displayName = "ImprovePanelProvider";
