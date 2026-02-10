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

function buildStep3({ includeInsights }: { includeInsights: boolean }): string {
  const toolRules = [
    `- \`get_available_skills\`: Call FIRST. Bias towards skills.`,
    `- \`get_available_tools\`: Only if clearly needed. If the desired agent is not specialized but meant to be multi-purpose, suggest "Discover Tools" skill instead.`,
    includeInsights &&
      `- \`get_agent_insights\`: Only if you need additional information to improve the agent.`,
    `- \`get_available_models\`: Only if user explicitly asks OR obvious need.`,
  ]
    .filter(Boolean)
    .join("\n");

  return `## STEP 3: After user responds, create suggestions
Tool usage rules when creating suggestions:
${toolRules}

Use \`suggest_*\` tools to create actionable suggestions. Brief explanation (3-4 sentences max). Always include their output verbatim in your response - it renders as interactive cards

Warning: do not suggest instructions if there is no existing tools or skills to do an action.
For instance if the user wants to create a agent to answer on JIRA issues but there is no tool to interact with JIRA then it won't be possible.
In that case, instead of doing prompt suggestions ask the user for clarifications.

Balance context gathering with latency - the first copilot message should be fast but helpful in driving builder actions.`;
}

function buildNewAgentInitMessage(): string {
  return `<dust_system>
NEW agent - no suggestions/feedback/insights.

## STEP 1: Gather context
You MUST call \`get_agent_config\` to retrieve the current agent configuration and any pending suggestions.
This tool must be called at session start to ensure you have the latest state.

The response includes:
- Agent settings (name, description, scope, model, tools, skills)
- Instructions: The committed instructions text (without pending suggestions)
- pendingSuggestions: Array of suggestions that have been made but not yet accepted/rejected by the user

## STEP 2: Discover templates & suggest use cases
Call \`search_agent_templates\` with the user's job type from your instructions to discover relevant templates.

Based on:
- Current form state (get_agent_config result)
- User's job function and preferred platforms (from your instructions)
- Matching templates (search_agent_templates result)

Provide 2-3 specific agent use case suggestions as bullet points. Use template userFacingDescription to inspire your suggestions. Example:
"I can help you build agents for your work in [role/team]. A few ideas:

• **Meeting prep agent** - pulls prospect info from CRM before calls
• **Follow-up drafter** - generates personalized emails based on call notes
• **Competitive intel** - monitors competitor news and surfaces updates

Pick one to start, or tell me what you're thinking."

## STEP 2.5: When user picks a use case

**If the selected use case matches a template with non-null copilotInstructions:**
The copilotInstructions contain domain-specific rules for this agent type. IMMEDIATELY create suggestions based on copilotInstructions - do NOT wait for user response.
Use \`suggest_*\` tools right away following the guidance in copilotInstructions.

**If no matching template or copilotInstructions is null/empty:**
Proceed to Step 3.

${buildStep3({ includeInsights: false })}
</dust_system>`;
}

function buildNewAgentInitMessageFromConversation(
  conversationId?: string
): string {
  return `<dust_system>
NEW agent - no suggestions/feedback/insights.

## STEP 1: Gather context
You MUST call these tools simultaneously in the same tool call round:
1. \`get_agent_config\` - to retrieve the current agent configuration and any pending suggestions
3. \`inspect_conversation\` - to retrieve the conversation (id = ${conversationId}) from which to provide use case suggestions

CRITICAL: All tools must be called together in parallel, not sequentially. Make all tool calls in your first response to minimize latency.

## STEP 2: Suggest a use case
Based on:
- Current form state (get_agent_config result)
- User's job function and preferred platforms (from your instructions)
- The conversation from which to extract agent instructions recommandations"

</dust_system>`;
}

function buildExistingAgentInitMessage(): string {
  return `<dust_system>
EXISTING agent.

## STEP 1: Gather context
You MUST call these tools simultaneously in the same tool call round:
1. \`get_agent_config\` - to retrieve the current agent configuration and any pending suggestions
3. \`get_agent_feedback\` - to retrieve feedback for the current version

CRITICAL: All tools must be called together in parallel, not sequentially. Make all tool calls in your first response to minimize latency.

## STEP 2: Provide context & prompt action
Based on gathered data, provide a brief summary:
- If reinforced suggestions exist (source="reinforcement"), highlight them
- If negative feedback patterns exist, mention the top issue
- If pending suggestions exist from \`get_agent_config\`, output their directives to render them as cards:
  CRITICAL: For each suggestion, output: \`:agent_suggestion[]{sId=<sId> kind=<kind>}\`

${buildStep3({ includeInsights: true })}
</dust_system>`;
}

function buildTemplateAgentInitMessage(templateId: string): string {
  return `<dust_system>
NEW agent from TEMPLATE.

## STEP 1: Gather context
You MUST call these tools simultaneously in the same tool call round:
1. \`get_agent_config\` - to retrieve the current agent configuration and any pending suggestions
2. \`get_agent_template\` with templateId="${templateId}" - to retrieve template-specific copilot instructions

CRITICAL: All tools must be called together in parallel, not sequentially.

## STEP 2: Check copilotInstructions and act accordingly

**If copilotInstructions has content:**
The copilotInstructions contain domain-specific rules for this agent type. IMMEDIATELY create suggestions based on copilotInstructions - do NOT wait for user response.
Use \`suggest_*\` tools right away following the guidance in copilotInstructions.

**If copilotInstructions is null or empty:**
Proceed exactly as a new agent - suggest 2-3 use cases based on user's job function and preferred platforms, then wait for user response.

${buildStep3({ includeInsights: false })}
</dust_system>`;
}

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
  templateId: string | null;
  conversationId?: string;
}

export const CopilotPanelProvider = ({
  children,
  targetAgentConfigurationId,
  targetAgentConfigurationVersion,
  clientSideMCPServerIds,
  isNewAgent,
  templateId,
  conversationId,
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

    let firstMessagePrompt: string;
    if (templateId) {
      firstMessagePrompt = buildTemplateAgentInitMessage(templateId);
    } else if (isNewAgent) {
      firstMessagePrompt = conversationId
        ? buildNewAgentInitMessageFromConversation(conversationId)
        : buildNewAgentInitMessage();
    } else {
      firstMessagePrompt = buildExistingAgentInitMessage();
    }

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
    isNewAgent,
    sendNotification,
    targetAgentConfigurationId,
    targetAgentConfigurationVersion,
    templateId,
    conversationId,
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
