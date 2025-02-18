import {
  AssistantCard,
  AssistantCardMore,
  Button,
  CardGrid,
  RobotIcon,
  Spinner,
  useSendNotification,
} from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  UserMessageType,
  WorkspaceType,
} from "@dust-tt/types";
import { useRouter } from "next/router";
import { useCallback, useMemo, useState } from "react";

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { setQueryParam } from "@app/lib/utils/router";

interface AgentSuggestionProps {
  conversationId: string;
  owner: WorkspaceType;
  userMessage: UserMessageType;
}

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
  const sendNotification = useSendNotification();

  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();

  const { submit: handleSelectSuggestion } = useSubmitFunction(
    async (agent: LightAgentConfigurationType) => {
      const editedContent = `:mention[${agent.name}]{sId=${agent.sId}} ${userMessage.content}`;
      const mRes = await fetch(
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
          title: "Invite sent",
          description: `Error adding mention to message: ${data.error.message}`,
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

  const showAssistantDetails = useCallback(
    (agentConfiguration: LightAgentConfigurationType) => {
      setQueryParam(router, "assistantDetails", agentConfiguration.sId);
    },
    [router]
  );

  return (
    <>
      <div className="pt-4">
        <div className="flex items-center gap-2 pb-2">
          <p className="grow text-base text-muted-foreground">
            Which Agent would you like to chat with?
          </p>
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
                variant="outline"
                size="sm"
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
          <CardGrid>
            {topAgents.map((agent, id) => (
              <AssistantCard
                key={`${agent.sId}-${id}`}
                description={agent.description}
                subtitle={agent.lastAuthors?.join(", ") ?? ""}
                title={agent.name}
                pictureUrl={agent.pictureUrl}
                onClick={() => handleSelectSuggestion(agent)}
                variant="secondary"
                action={
                  <AssistantCardMore
                    onClick={() => showAssistantDetails(agent)}
                  />
                }
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
