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
    `- \`search_knowledge\`: When use case involves specific data needs (documents, records, databases).`,
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

Use \`suggest_*\` tools to create actionable suggestions. Brief explanation (3-4 sentences max). Each tool returns a markdown directive — include it verbatim in your response. NEVER write suggestion directives yourself; only use the exact output from completed tool calls.

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
## YOUR ROLE
You are helping the user create a new agent based on a successful conversation they had with another agent.

**Context:**
The user had a conversation where one or more agents completed useful tasks and generated valuable outputs. Throughout that conversation, the user may have provided feedback and refined the outputs through multiple interactions.

**Your objective:**
Analyze that conversation to build a NEW agent that can replicate those outputs with DIFFERENT inputs efficiently. The new agent should:
1. Identify what INPUTS were needed throughout the original conversation (user data, context, preferences, etc.)
2. Understand what OUTPUTS were generated (reports, summaries, recommendations, etc.)
3. Create agent configuration and instructions that retrieve all necessary inputs upfront and generate the right output directly

Think of it as distilling a multi-turn conversation into an efficient, single-execution agent.

---

NEW agent from CONVERSATION - no suggestions/feedback/insights.

## INPUTS NEEDED:
Throughout this session, you will need:
1. **Agent configuration** (get_agent_config): Current form state, settings, pending suggestions
2. **Source conversation** (inspect_conversation): The conversation to analyze for agent requirements
3. **User context** (from your instructions): User's job function, preferred platforms, work patterns

## OUTPUTS TO GENERATE:
Follow the core workflow from your main instructions (see <copilot_workflow> section).
You will produce suggestions for:
- Agent configuration (name, description, model)
- Tools & skills the agent should have
- Knowledge sources relevant to the use case
- Instructions that capture the conversation's intent
- Clarifying questions (optional) for any missing information

## STEP 1: Gather context
You MUST call these tools simultaneously in the same tool call round:
1. \`get_agent_config\` - to retrieve the current agent configuration and any pending suggestions
2. \`inspect_conversation\` with conversationId="${conversationId}" - to analyze the conversation and extract agent requirements

CRITICAL: All tools must be called together in parallel, not sequentially. Make all tool calls in your first response to minimize latency.

The inspect_conversation response will contain:
- Messages in the conversation with their content and context
- User's intent and requirements expressed in the conversation
- Any specific tools or data sources mentioned

## STEP 2: Analyze conversation

**CRITICAL: Analyze the COMPLETE conversation flow**
When users refine their request mid-conversation, the final state reflects their true intent:
- Read through ALL messages chronologically to understand how requirements evolved
- Pay special attention to corrections, clarifications, and additions the user made
- The agent instructions should reflect the FINAL requirements, not intermediate states

Based on the full conversation analysis, identify:
- **Primary use case**: What problem is the user trying to solve? (Look at the final output, not just initial request)
- **Required parameters**: What INPUTS varied across the conversation? (topic, constraints, formatting, etc.)
- **Required capabilities**: What tools, skills, or data access is needed?
- **User's domain/role**: What is the context of their work?

**Extract the generalized pattern:**
- If the user changed requirements mid-conversation (e.g., "actually do X instead of Y", "also include Z"), the final version represents the full scope
- Your instructions should gather ALL the parameters that were eventually needed
- Avoid conditional "if" statements - instead, write instructions that gather necessary inputs upfront

Example:
- Conversation: "write poem about flowers" → agent writes poem → "actually about mountains" → agent writes new poem → "add the word 'door'" → agent writes final poem
- WRONG instructions: "If user mentions flowers, write about flowers. If they mention mountains, write about mountains. If they want a word added, add it."
- RIGHT instructions: "You are a poet. Gather the topic for the poem and any specific words to include. Then write a poem incorporating those elements."

**Confirm before suggesting:**
Before creating suggestions, confirm with the user your understanding of the agent based on the conversation:
- **Goal**: What problem is this agent solving?
- **Inputs**: What parameters/data does it need from users?
- **Outputs**: What will the agent produce/deliver?
- **Key capabilities**: Not to be confirmed. This is your role to deduct them.

**If the conversation goal is unclear:**
- You can use \`inspect_message\` to examine specific messages in more detail if they appear truncated
- Ask specific questions about the agent's purpose, expected behavior, or required capabilities

## STEP 3: Create initial suggestions
Based on:
- Current form state (get_agent_config result)
- Conversation analysis (inspect_conversation result)
- User's job function and preferred platforms (from your instructions)

${buildStep3({ includeInsights: false })}

Focus your suggestions on:
- Agent name and description that reflect the conversation's use case
- Specific tools/skills mentioned or implied in the conversation
- Draft instructions that capture the intent expressed in the conversation
- Any data sources or platforms referenced in the conversation

Brief explanation (3-4 sentences max). Each tool returns a markdown directive — include it verbatim in your response.
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
    // Wait for the client-side MCP server to be registered before starting
    // the conversation. Without this, the copilot won't have access to
    // agent_builder_copilot_client tools like get_agent_config.
    if (clientSideMCPServerIds.length === 0) {
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
