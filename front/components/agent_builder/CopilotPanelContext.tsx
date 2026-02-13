import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import { useAuth } from "@app/lib/auth/AuthContext";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { ConversationType } from "@app/types/assistant/conversation";
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

  return `## STEP 3: Evaluate & create suggestions
Follow the core workflow from your main instructions.
Create suggestions in your first response. Do not wait for the user to respond. If you see improvements, suggest them now. Add clarifying questions only after creating suggestions.

Tool usage: ${toolRules}

Use \`suggest_*\` tools to create actionable suggestions. Brief explanation (3-4 sentences max). Always include their output verbatim in your response - it renders as interactive cards.

Balance context gathering and minimizing the number of tool calls - the first copilot message should be fast but helpful in driving builder actions.`;
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
Call search_agent_templates with the user's job type from your instructions to discover relevant templates.

Based on:
- Current form state (get_agent_config result)
- User's job function and preferred platforms (from your instructions)
- Matching templates (search_agent_templates result)

Provide 2-3 specific agent use case suggestions. PRIORITIZE templates returned by \`search_agent_templates\` — if templates are available, prioritize them even if job type is not specified (use its userFacingDescription to inspire the suggestion). Templates have copilotInstructions that make the builder experience much better.
IMPORTANT: Use case suggestions MUST use the \`:quickReply\` directive format so users can click to select. Do NOT use bullet points. Do NOT put any text after the last \`:quickReply\` directive — the buttons are self-explanatory.
Example:
"I can help you build agents for your work in [role/team]. Here are a few ideas, or tell me if you have another idea in mind:

:quickReply[Meeting prep agent - pulls prospect info from CRM]{message="I want to build a meeting prep agent that pulls prospect info from CRM before calls"}
:quickReply[Follow-up drafter - generates personalized emails]{message="I want to build a follow-up drafter that generates personalized emails based on call notes"}
:quickReply[Competitive intel - monitors competitor news]{message="I want to build a competitive intel agent that monitors competitor news and surfaces updates"}"

## STEP 2.5: When user responds

**If the user's response matches a template with non-null copilotInstructions:**
You already have all template data from \`search_agent_templates\` in STEP 2. Do NOT call \`get_agent_template\`.
The copilotInstructions contain domain-specific rules for this agent type. IMMEDIATELY create suggestions based on copilotInstructions - do NOT wait for user response.
Use \`suggest_*\` tools right away following the guidance in copilotInstructions.

**If the user's response does NOT match any template from Step 2:**
Call search_agent_templates with the EXACT user's message as the \`query\` param to find semantically matching templates. If a match with copilotInstructions is found, use it as above.

**Fallback — no matching template or copilotInstructions is null/empty:**
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
  const { user } = useAuth();
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
