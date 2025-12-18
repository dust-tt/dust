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
import { useAddUserMessageMention } from "@app/hooks/useAddUserMessageMention";
import { useSubmitFunction } from "@app/lib/client/utils";
import {
  useAgentConfigurations,
  useSuggestedAgentConfigurations,
} from "@app/lib/swr/assistants";
import { setQueryParam } from "@app/lib/utils/router";
import type {
  LightAgentConfigurationType,
  UserMessageTypeWithContentFragments,
  WorkspaceType,
} from "@app/types";
import { GLOBAL_AGENTS_SID, toRichAgentMentionType } from "@app/types";

interface AgentSuggestionProps {
  conversationId: string;
  owner: WorkspaceType;
  userMessage: UserMessageTypeWithContentFragments;
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

  const autoSelectedMessageIdRef = useRef<string | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);

  const router = useRouter();
  const { setSelectedAgent } = useContext(InputBarContext);

  const dustAgent = agentConfigurations.find(
    (agent) => agent.sId === GLOBAL_AGENTS_SID.DUST && agent.status === "active"
  );

  const addMention = useAddUserMessageMention({
    owner,
    conversationId,
  });

  useEffect(() => {
    if (!dustAgent) {
      setShowSuggestion(true);
    }
  }, [dustAgent]);

  const { submit: handleSelectSuggestion, isSubmitting } = useSubmitFunction(
    async (agent: LightAgentConfigurationType) => {
      const success = await addMention({
        agent,
        userMessage,
      });

      // In case the auto-selection failed, we show the suggestion.
      if (!success && dustAgent && !showSuggestion) {
        setShowSuggestion(true);
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
      isSubmitting ||
      !dustAgent ||
      userMessage.id === -1 ||
      userMessage.sId === autoSelectedMessageIdRef.current ||
      // Only auto-select the dust agent if it is the first user message in the conversation
      // Rank might be > 0 if there are content fragments (as they account for message ranks)
      userMessage.rank !== userMessage.contentFragments.length
    ) {
      return;
    }

    autoSelectedMessageIdRef.current = userMessage.sId;
    setSelectedAgent(toRichAgentMentionType(dustAgent));
    void handleSelectSuggestion(dustAgent);
  }, [
    dustAgent,
    userMessage.id,
    userMessage.sId,
    userMessage.rank,
    setSelectedAgent,
    handleSelectSuggestion,
    userMessage.contentFragments.length,
    isSubmitting,
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
                if (isSubmitting) {
                  return;
                }

                setSelectedAgent(toRichAgentMentionType(agent));
                await handleSelectSuggestion(agent);
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
            if (isSubmitting) {
              return;
            }
            setSelectedAgent(toRichAgentMentionType(agent));
            await handleSelectSuggestion(agent);
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
