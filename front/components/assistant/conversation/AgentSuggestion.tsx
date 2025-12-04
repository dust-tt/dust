import {
  AssistantCard,
  AssistantCardMore,
  Button,
  LoadingBlock,
  Page,
  RobotIcon,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AgentPicker } from "@app/components/assistant/AgentPicker";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useSendNotification } from "@app/hooks/useNotification";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress";
import { serializeMention } from "@app/lib/mentions/format";
import {
  useAgentConfigurations,
  useSuggestedAgentConfigurations,
} from "@app/lib/swr/assistants";
import { setQueryParam } from "@app/lib/utils/router";
import type {
  LightAgentConfigurationType,
  UserMessageType,
  WorkspaceType,
} from "@app/types";
import { GLOBAL_AGENTS_SID } from "@app/types";

interface AgentSuggestionProps {
  conversationId: string;
  owner: WorkspaceType;
  userMessage: UserMessageType;
}

const MAX_SUGGESTED_AGENTS = 4;

export function AgentSuggestion({
  conversationId,
  owner,
  userMessage,
}: AgentSuggestionProps) {
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
    includes: ["authors", "usage"],
  });

  const {
    suggestedAgentConfigurations,
    isSuggestedAgentConfigurationsLoading,
  } = useSuggestedAgentConfigurations({
    workspaceId: owner.sId,
    conversationId,
    messageId: userMessage.sId,
    disabled:
      userMessage.id === -1 || userMessage.sId.startsWith("placeholder"),
  });

  const sendNotification = useSendNotification();

  const autoSelectedMessageIdRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestion, setShowSuggestion] = useState(false);

  const router = useRouter();
  const { setSelectedAgent } = useContext(InputBarContext);

  const dustAgent = agentConfigurations.find(
    (agent) => agent.sId === GLOBAL_AGENTS_SID.DUST && agent.status === "active"
  );

  useEffect(() => {
    if (!dustAgent) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowSuggestion(true);
    }
  }, [dustAgent]);

  const { submit: handleSelectSuggestion } = useSubmitFunction(
    async (agent: LightAgentConfigurationType) => {
      // Ensure proper formatting: if content starts with markdown that requires being at
      // the beginning of a line (code blocks, list items, etc.), add a newline after the
      // mention so the markdown remains valid.
      const contentStartsWithLineStartMarkdown = userMessage.content.match(
        /^(\s*)(```|`|---|\*\*\*|#{1,6}\s|[-*+]\s|>\s|\d+\.\s)/
      );
      const editedContent = contentStartsWithLineStartMarkdown
        ? `${serializeMention(agent)}\n\n${userMessage.content}`
        : `${serializeMention(agent)} ${userMessage.content}`;
      const mRes = await clientFetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${userMessage.sId}/edit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: editedContent,
            mentions: [
              {
                type: "agent",
                configurationId: agent.sId,
              },
            ],
          }),
        }
      );

      if (!mRes.ok) {
        const data = await mRes.json();
        sendNotification({
          type: "error",
          title: "Error adding mention to message",
          description: data.error.message,
        });
        // In case the auto-selection failed, we show the suggestion.
        if (dustAgent && !showSuggestion) {
          setShowSuggestion(true);
        }
      }
    }
  );

  const [suggestedAgents, allSortedAgents] = useMemo(() => {
    const allSortedAgents = agentConfigurations.sort((a, b) => {
      return sortAgents(a, b);
    });

    if (suggestedAgentConfigurations.length > 0) {
      const suggested = suggestedAgentConfigurations.slice(
        0,
        MAX_SUGGESTED_AGENTS
      );
      return [suggested, allSortedAgents];
    }

    if (isSuggestedAgentConfigurationsLoading || !allSortedAgents.length) {
      return [[], []];
    }

    return [allSortedAgents.slice(0, MAX_SUGGESTED_AGENTS), allSortedAgents];
  }, [
    agentConfigurations,
    suggestedAgentConfigurations,
    isSuggestedAgentConfigurationsLoading,
  ]);

  const showAgentDetails = useCallback(
    (agentConfiguration: LightAgentConfigurationType) => {
      setQueryParam(router, "agentDetails", agentConfiguration.sId);
    },
    [router]
  );

  useEffect(() => {
    if (
      !dustAgent ||
      userMessage.id === -1 ||
      userMessage.sId === autoSelectedMessageIdRef.current
    ) {
      return;
    }

    autoSelectedMessageIdRef.current = userMessage.sId;
    setSelectedAgent({ configurationId: dustAgent.sId });
    void handleSelectSuggestion(dustAgent);
  }, [
    dustAgent,
    userMessage.id,
    userMessage.sId,
    setSelectedAgent,
    handleSelectSuggestion,
  ]);

  if (!showSuggestion) {
    return null;
  }

  return (
    <div className="flex flex-col items-start gap-6">
      <Page.SectionHeader
        title="Best-matching Agents"
        description="Selected based on agents' descriptions, names, and available tools."
      />
      {suggestedAgents.length === 0 ? (
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
          <LoadingBlock className="h-[130px] w-full rounded-xl" />
          <LoadingBlock className="h-[130px] w-full rounded-xl" />
          <LoadingBlock className="h-[130px] w-full rounded-xl" />
          <LoadingBlock className="h-[130px] w-full rounded-xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
          {suggestedAgents.map((agent, id) => (
            <AssistantCard
              key={`${agent.sId}-${id}`}
              description={agent.description}
              subtitle={agent.lastAuthors?.join(", ") ?? ""}
              title={agent.name}
              pictureUrl={agent.pictureUrl}
              onClick={async () => {
                if (isLoading) {
                  return;
                }
                setIsLoading(true);
                setSelectedAgent({ configurationId: agent.sId });
                await handleSelectSuggestion(agent);
                setIsLoading(false);
              }}
              variant="secondary"
              action={
                <AssistantCardMore onClick={() => showAgentDetails(agent)} />
              }
            />
          ))}
        </div>
      )}
      <div className="flex flex-row items-center gap-2">
        <p className="flex text-sm text-muted-foreground">Or</p>
        <AgentPicker
          owner={owner}
          agents={allSortedAgents}
          onItemClick={async (agent) => {
            if (isLoading) {
              return;
            }
            setIsLoading(true);
            setSelectedAgent({ configurationId: agent.sId });
            await handleSelectSuggestion(agent);
            setIsLoading(false);
          }}
          pickerButton={
            <Button
              variant="outline"
              size="sm"
              icon={RobotIcon}
              label="Pick an agent"
              isSelect
            />
          }
        />
      </div>
    </div>
  );
}

/*
 * Custom function to sort agents based on their usage while setting Dust
 * as a first element
 */
function sortAgents(
  a: LightAgentConfigurationType,
  b: LightAgentConfigurationType
) {
  // Place favorites first
  if (a.userFavorite && !b.userFavorite) {
    return -1;
  }
  if (b.userFavorite && !a.userFavorite) {
    return 1;
  }
  // Dust always first
  if (a.sId === GLOBAL_AGENTS_SID.DUST) {
    return -1;
  } else if (b.sId === GLOBAL_AGENTS_SID.DUST) {
    return 1;
  }
  // Deep dive always second
  if (a.sId === GLOBAL_AGENTS_SID.DEEP_DIVE) {
    return -1;
  } else if (b.sId === GLOBAL_AGENTS_SID.DEEP_DIVE) {
    return 1;
  }

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  return (b.usage?.messageCount || 0) - (a.usage?.messageCount || 0);
}
