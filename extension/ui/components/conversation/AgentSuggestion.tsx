import { useDustAPI } from "@app/shared/lib/dust_api";
import { GLOBAL_AGENTS_SID } from "@app/shared/lib/global_agents";
import { AssistantPicker } from "@app/ui/components/assistants/AssistantPicker";
import { usePublicAgentConfigurations } from "@app/ui/components/assistants/usePublicAgentConfigurations";
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
import { useMemo, useState } from "react";

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

  const [isLoading, setIsLoading] = useState(false);
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
    }
  );

  const [topAgents, otherAgents] = useMemo(() => {
    const agents = agentConfigurations.sort((a, b) => {
      return sortAgents(a, b);
    });
    return [agents.slice(0, 3), agents.slice(3)];
  }, [agentConfigurations]);

  return (
    <>
      <div className="pt-4">
        <div className="flex items-center gap-2">
          <span className="grow text-sm text-muted-foreground dark:text-muted-foreground-night">
            Which Agent would you like to chat with?
          </span>
          <AssistantPicker
            owner={owner}
            assistants={otherAgents}
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
