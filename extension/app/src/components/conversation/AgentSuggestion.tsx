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
import { AssistantPicker } from "@extension/components/assistants/AssistantPicker";
import { usePublicAgentConfigurations } from "@extension/components/assistants/usePublicAgentConfigurations";
import { useSubmitFunction } from "@extension/components/utils/useSubmitFunction";
import { useDustAPI } from "@extension/lib/dust_api";
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
          title: "Invite sent",
          description: `Error adding mention to message: ${mRes.error.message}`,
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
          <span className="grow text-sm text-element-800 dark:text-element-800-night">
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
  // Place favorites first
  if (a.userFavorite && !b.userFavorite) {
    return -1;
  }
  if (b.userFavorite && !a.userFavorite) {
    return 1;
  }
  if (a.sId === "dust") {
    return -1;
  } else if (b.sId === "dust") {
    return 1;
  }
  return (b.usage?.messageCount || 0) - (a.usage?.messageCount || 0);
}
