import { useDustAPI } from "@app/shared/lib/dust_api";
import { GLOBAL_AGENTS_SID } from "@app/shared/lib/global_agents";
import { AgentPicker } from "@app/ui/components/agents/AgentPicker";
import { usePublicAgentConfigurations } from "@app/ui/components/agents/usePublicAgentConfigurations";
import { useSubmitFunction } from "@app/ui/components/utils/useSubmitFunction";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
  UserMessageType,
} from "@dust-tt/client";
import {
  AssistantCard,
  Button,
  CardGrid,
  RobotIcon,
  Spinner,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef, useState } from "react";

interface AgentSuggestionProps {
  conversationId: string;
  owner: LightWorkspaceType;
  userMessage: UserMessageType;
}

export function AgentSuggestion({
  conversationId,
  owner,
  userMessage,
}: AgentSuggestionProps) {
  const { agentConfigurations } = usePublicAgentConfigurations();
  const sendNotification = useSendNotification();

  const autoSelectedMessageIdRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const dustAPI = useDustAPI();

  const { submit: handleSelectSuggestion } = useSubmitFunction(
    async (agent: LightAgentConfigurationType) => {
      const editedContent = `:mention[${agent.name}]{sId=${agent.sId}} ${userMessage.content}`;
      const mRes = await dustAPI.request({
        method: "POST",
        path: `assistant/conversations/${conversationId}/messages/${userMessage.sId}/edit`,
        body: {
          content: editedContent,
          mentions: [
            {
              type: "agent",
              configurationId: agent.sId,
            },
          ],
        },
      });

      if (!mRes.isOk()) {
        sendNotification({
          type: "error",
          title: "Error adding mention to message",
          description: mRes.error.message,
        });
      }
      // In case the auto-selection failed, we show the suggestion.
      if (dustAgent && !showSuggestion) {
        setShowSuggestion(true);
      }
    }
  );

  const dustAgent = agentConfigurations.find(
    (agent) => agent.sId === GLOBAL_AGENTS_SID.DUST && agent.status === "active"
  );

  useEffect(() => {
    if (!dustAgent) {
      setShowSuggestion(true);
    }
  }, [dustAgent]);

  const [topAgents, otherAgents] = useMemo(() => {
    const agents = agentConfigurations.sort((a, b) => {
      return sortAgents(a, b);
    });
    return [agents.slice(0, 3), agents.slice(3)];
  }, [agentConfigurations]);

  useEffect(() => {
    if (
      !dustAgent ||
      userMessage.id === -1 ||
      userMessage.sId.startsWith("placeholder") ||
      userMessage.sId === autoSelectedMessageIdRef.current
    ) {
      return;
    }

    autoSelectedMessageIdRef.current = userMessage.sId;
    void handleSelectSuggestion(dustAgent);
  }, [dustAgent, userMessage.id, userMessage.sId, handleSelectSuggestion]);

  if (!showSuggestion) {
    return null;
  }

  return (
    <>
      <div className="pt-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground dark:text-muted-foreground-night grow text-sm">
            Which Agent would you like to chat with?
          </span>
          <AgentPicker
            owner={owner}
            agents={otherAgents}
            onItemClick={async (agent) => {
              if (!isLoading) {
                setIsLoading(true);
                await handleSelectSuggestion(agent);
                setIsLoading(false);
              }
            }}
            pickerButton={
              <Button
                variant="ghost"
                size="xs"
                icon={RobotIcon}
                label="Select another"
                isSelect
              />
            }
          />
        </div>

        {agentConfigurations.length === 0 ? (
          <div className="flex h-full min-h-28 w-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <CardGrid className="mb-12">
            {topAgents.map((agent, id) => (
              <AssistantCard
                key={`${agent.sId}-${id}`}
                description={agent.description}
                subtitle={agent.lastAuthors?.join(", ") ?? ""}
                title={agent.name}
                pictureUrl={agent.pictureUrl}
                onClick={() => handleSelectSuggestion(agent)}
              />
            ))}
          </CardGrid>
        )}
      </div>
    </>
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
  if (a.userFavorite && !b.userFavorite) {
    return -1;
  }
  if (b.userFavorite && !a.userFavorite) {
    return 1;
  }

  if (a.sId === GLOBAL_AGENTS_SID.DUST) {
    return -1;
  } else if (b.sId === GLOBAL_AGENTS_SID.DUST) {
    return 1;
  }

  if (a.sId === GLOBAL_AGENTS_SID.DEEP_DIVE) {
    return -1;
  } else if (b.sId === GLOBAL_AGENTS_SID.DEEP_DIVE) {
    return 1;
  }

  return (b.usage?.messageCount || 0) - (a.usage?.messageCount || 0);
}
