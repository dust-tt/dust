import { AssistantPreview, Button, RobotIcon, Spinner } from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  UserMessageType,
  WorkspaceType,
} from "@dust-tt/types";
import { useContext, useMemo, useState } from "react";

import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useAgentConfigurations } from "@app/lib/swr";

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
    agentsGetView: { conversationId: conversationId },
    includes: ["authors", "usage"],
  });
  const sendNotification = useContext(SendNotificationsContext);

  const [isLoading, setIsLoading] = useState(false);

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

  const [showAssistantDetail, setShowAssistantDetail] =
    useState<LightAgentConfigurationType | null>(null);

  return (
    <>
      <AssistantDetails
        assistantId={showAssistantDetail?.sId || null}
        owner={owner}
        onClose={() => setShowAssistantDetail(null)}
      />
      <div className="pt-4">
        <div className="flex items-center gap-2">
          <span className="grow text-sm text-element-800">
            Which Assistant would you like to chat with?
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
                variant="tertiary"
                size="xs"
                icon={RobotIcon}
                label="Select another"
                type="menu"
              />
            }
          />
        </div>

        {agentConfigurations.length === 0 ? (
          <div className="flex h-full min-h-28 w-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {topAgents.map((agent, id) => (
              <AssistantPreview
                key={`${agent.sId}-${id}`}
                variant="minimal"
                description={agent.description}
                subtitle={agent.lastAuthors?.join(", ") ?? ""}
                title={agent.name}
                pictureUrl={agent.pictureUrl}
                onClick={() => handleSelectSuggestion(agent)}
                onActionClick={() => setShowAssistantDetail(agent)}
              />
            ))}
          </div>
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
  if (a.sId === "dust") {
    return -1;
  } else if (b.sId === "dust") {
    return 1;
  }
  return (b.usage?.messageCount || 0) - (a.usage?.messageCount || 0);
}
