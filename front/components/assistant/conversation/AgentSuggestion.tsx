import {
  AssistantCard,
  AssistantCardMore,
  Button,
  Page,
  RobotIcon,
  Spinner,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { useCallback, useMemo, useState } from "react";

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import { useSubmitFunction } from "@app/lib/client/utils";
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

  const showAssistantDetails = useCallback(
    (agentConfiguration: LightAgentConfigurationType) => {
      setQueryParam(router, "assistantDetails", agentConfiguration.sId);
    },
    [router]
  );

  return (
    <div className="flex flex-col items-start gap-6">
      {suggestedAgents.length === 0 ? (
        <div className="flex min-h-28 w-full items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <>
          <Page.SectionHeader
            title="Best-matching Agents"
            description="Selected based on agents' descriptions, names, and available tools."
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
            {suggestedAgents.map((agent, id) => (
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
          </div>
          <div className="flex flex-row items-center gap-2">
            <p className="flex text-base text-muted-foreground">Or</p>
            <AssistantPicker
              owner={owner}
              assistants={allSortedAgents}
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
                  label="Pick an agent"
                  isSelect
                />
              }
            />
          </div>
        </>
      )}
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
  if (a.sId === "dust") {
    return -1;
  } else if (b.sId === "dust") {
    return 1;
  }
  return (b.usage?.messageCount || 0) - (a.usage?.messageCount || 0);
}
