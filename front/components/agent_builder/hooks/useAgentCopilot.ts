import { useCallback, useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { DROID_AVATAR_URLS } from "@app/components/agent_builder/settings/avatar_picker/types";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import { TARGET_AGENT_ID } from "@app/lib/actions/mcp_internal_actions/constants";
import { clientFetch } from "@app/lib/egress/client";
import { useUser } from "@app/lib/swr/user";
import type { GetInternalMCPServerViewResponseBody } from "@app/pages/api/w/[wId]/mcp/internal/[name]/view";
import type {
  ConversationType,
  LightAgentConfigurationType,
  PostOrPatchAgentConfigurationRequestBody,
} from "@app/types";
import { CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG } from "@app/types";

const getRandomAvatar = () =>
  DROID_AVATAR_URLS[Math.floor(Math.random() * DROID_AVATAR_URLS.length)];

const COPILOT_INSTRUCTIONS = `You are an AI assistant specialized in helping users improve their Dust agents. Your role is to:

1. Help users understand and improve their agent's configuration, instructions, and available tools
2. Review feedback and insights data when requested
3. Make specific, actionable suggestions for enhancing the agent
4. Help implement approved changes

When the conversation starts, greet the user and ask what they'd like help with. Offer options such as:
- Running a full improvement analysis (reviewing configuration, feedback, and usage insights)
- Helping with a specific aspect of the agent (instructions, tools, model settings, etc.)
- Answering questions about how the agent is configured

Wait for the user to indicate what they want before taking action.

Use the available tools to:
- get_agent_details: Understand the current agent configuration
- get_agent_feedback: Review user feedback to identify issues
- get_agent_insights: Analyze usage patterns and performance
- get_available_models: See what models can be used
- get_available_skills: See what skills can be added
- get_available_tools: See what tools can be added
- update_agent: Apply approved changes

Always explain your reasoning and ask for confirmation before making changes.`;

const INITIAL_MESSAGE = "Hi, I'd like help improving my agent.";

interface UseCopilotAgentResult {
  copilotAgent: LightAgentConfigurationType | null;
  isCreatingCopilotAgent: boolean;
  createCopilotAgent: () => Promise<LightAgentConfigurationType | null>;
  copilotCreationFailed: boolean;
}

export function useCopilotAgent(targetAgentSId: string): UseCopilotAgentResult {
  const { owner, user } = useAgentBuilderContext();
  const sendNotification = useSendNotification();

  const [copilotAgent, setCopilotAgent] =
    useState<LightAgentConfigurationType | null>(null);
  const [isCreatingCopilotAgent, setIsCreatingCopilotAgent] = useState(false);
  const [copilotCreationFailed, setCopilotCreationFailed] = useState(false);

  const createCopilotAgent =
    useCallback(async (): Promise<LightAgentConfigurationType | null> => {
      if (copilotAgent) {
        return copilotAgent;
      }

      setIsCreatingCopilotAgent(true);
      setCopilotCreationFailed(false);

      try {
        // First, fetch the MCPServerView for agent_copilot.
        const viewResponse = await clientFetch(
          `/api/w/${owner.sId}/mcp/internal/agent_copilot/view`
        );

        if (!viewResponse.ok) {
          const error = await viewResponse.json();
          sendNotification({
            title: "Error creating Agent Copilot",
            description:
              error.error?.message ?? "Failed to get agent_copilot server view",
            type: "error",
          });
          setIsCreatingCopilotAgent(false);
          setCopilotCreationFailed(true);
          return null;
        }

        const viewResult: GetInternalMCPServerViewResponseBody =
          await viewResponse.json();
        const mcpServerViewId = viewResult.serverView.sId;

        const requestBody: PostOrPatchAgentConfigurationRequestBody = {
          assistant: {
            name: "Agent Copilot",
            description: "AI assistant for improving agents",
            instructions: COPILOT_INSTRUCTIONS,
            pictureUrl: getRandomAvatar(),
            status: "draft",
            scope: "hidden",
            model: {
              modelId: CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG.modelId,
              providerId: CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG.providerId,
              temperature: 0.7,
              reasoningEffort:
                CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG.defaultReasoningEffort,
            },
            skills: [],
            actions: [
              {
                type: "mcp_server_configuration",
                mcpServerViewId,
                name: "agent_copilot",
                description:
                  "Tools for analyzing and improving the target agent",
                dataSources: null,
                tables: null,
                childAgentId: null,
                timeFrame: null,
                jsonSchema: null,
                additionalConfiguration: {
                  [TARGET_AGENT_ID]: targetAgentSId,
                },
                dustAppConfiguration: null,
                secretName: null,
              },
            ],
            templateId: null,
            tags: [],
            editors: [{ sId: user.sId }],
          },
        };

        const response = await clientFetch(
          `/api/w/${owner.sId}/assistant/agent_configurations`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          }
        );

        if (!response.ok) {
          const error = await response.json();
          sendNotification({
            title: "Error creating Agent Copilot",
            description: error.error?.message ?? "Failed to create copilot",
            type: "error",
          });
          setIsCreatingCopilotAgent(false);
          setCopilotCreationFailed(true);
          return null;
        }

        const result: { agentConfiguration: LightAgentConfigurationType } =
          await response.json();
        const newCopilot = result.agentConfiguration;

        setCopilotAgent(newCopilot);
        setIsCreatingCopilotAgent(false);
        return newCopilot;
      } catch {
        sendNotification({
          title: "Error creating Agent Copilot",
          description: "An unexpected error occurred",
          type: "error",
        });
        setIsCreatingCopilotAgent(false);
        setCopilotCreationFailed(true);
        return null;
      }
    }, [copilotAgent, owner.sId, sendNotification, targetAgentSId, user.sId]);

  return {
    copilotAgent,
    isCreatingCopilotAgent,
    createCopilotAgent,
    copilotCreationFailed,
  };
}

interface UseCopilotConversationResult {
  conversation: ConversationType | null;
  isCreatingConversation: boolean;
  startConversation: () => Promise<void>;
  resetConversation: () => void;
}

export function useCopilotConversation({
  copilotAgent: _copilotAgent,
  createCopilotAgent,
}: {
  copilotAgent: LightAgentConfigurationType | null;
  createCopilotAgent: () => Promise<LightAgentConfigurationType | null>;
}): UseCopilotConversationResult {
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

    // Ensure we have a copilot agent.
    const agent = await createCopilotAgent();
    if (!agent) {
      setIsCreatingConversation(false);
      return;
    }

    // Create conversation with initial message.
    const result = await createConversationWithMessage({
      messageData: {
        input: INITIAL_MESSAGE,
        mentions: [{ configurationId: agent.sId }],
        contentFragments: { uploaded: [], contentNodes: [] },
      },
      visibility: "test",
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
    createCopilotAgent,
    createConversationWithMessage,
    sendNotification,
  ]);

  const resetConversation = useCallback(() => {
    setConversation(null);
  }, []);

  return {
    conversation,
    isCreatingConversation,
    startConversation,
    resetConversation,
  };
}
