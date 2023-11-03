import { Button, RobotIcon } from "@dust-tt/sparkle";
import { useContext, useState } from "react";

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { compareAgentsForSort } from "@app/lib/assistant";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useAgentConfigurations } from "@app/lib/swr";
import { AgentConfigurationType } from "@app/types/assistant/agent";
import {
  ConversationType,
  isAgentMention,
  isUserMessageType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { WorkspaceType } from "@app/types/user";

export function AgentSuggestion({
  owner,
  userMessage,
  conversation,
}: {
  owner: WorkspaceType;
  userMessage: UserMessageType;
  conversation: ConversationType;
}) {
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
  });
  const sendNotification = useContext(SendNotificationsContext);

  const agents = agentConfigurations.filter((a) => a.status === "active");
  agents.sort((a, b) => compareAgentSuggestions(a, b));

  const [loading, setLoading] = useState(false);

  return (
    <div className="pt-4">
      <div className="text-xs font-bold text-element-600">
        Which Assistant would you like to talk with?
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button.List isWrapping={true}>
          {agents.slice(0, 3).map((agent) => (
            <div key={`message-${userMessage.sId}-suggestion-${agent.sId}`}>
              <Button
                size="xs"
                variant="avatar"
                label={`@${agent.name}`}
                onClick={() => handleSelectSuggestion(agent)}
                disabled={isSelectingSuggestion}
                avatar={agent.pictureUrl}
              />
            </div>
          ))}
          <AssistantPicker
            owner={owner}
            assistants={agents.slice(3)}
            onItemClick={async (agent) => {
              if (!loading) {
                setLoading(true);
                await handleSelectSuggestion(agent);
                setLoading(false);
              }
            }}
            pickerButton={
              <Button
                variant="tertiary"
                size="xs"
                icon={RobotIcon}
                label="Select another"
              />
            }
          />
        </Button.List>
      </div>
    </div>
  );

  const {
    submit: handleSelectSuggestion,
    isSubmitting: isSelectingSuggestion,
  } = useSubmitFunction(async (agent: AgentConfigurationType) => {
    const editedContent = `:mention[${agent.name}]{sId=${agent.sId}} ${userMessage.content}`;
    const mRes = await fetch(
      `/api/w/${owner.sId}/assistant/conversations/${conversation.sId}/messages/${userMessage.sId}/edit`,
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
      window.alert(`Error adding mention to message: ${data.error.message}`);
      sendNotification({
        type: "error",
        title: "Invite sent",
        description: `Error adding mention to message: ${data.error.message}`,
      });
    }
  });

  /**
   * Compare agents by whom was last mentioned in conversation from this user. If none has been
   * mentioned, use the shared `compareAgentsForSort` function.
   */
  function compareAgentSuggestions(
    a: AgentConfigurationType,
    b: AgentConfigurationType
  ) {
    // index of last user message in conversation mentioning agent a
    const aIndex = conversation.content.findLastIndex((ms) =>
      ms.some(
        (m) =>
          isUserMessageType(m) &&
          m.user?.id === userMessage.user?.id &&
          m.mentions.some(
            (mention) =>
              isAgentMention(mention) && mention.configurationId === a.sId
          )
      )
    );
    // index of last user message in conversation mentioning agent b
    const bIndex = conversation.content.findLastIndex((ms) =>
      ms.some(
        (m) =>
          isUserMessageType(m) &&
          m.user?.id === userMessage.user?.id &&
          m.mentions.some(
            (mention) =>
              isAgentMention(mention) && mention.configurationId === b.sId
          )
      )
    );

    if (aIndex === -1 && bIndex === -1) {
      return compareAgentsForSort(a, b);
    }

    // if a or b was mentioned, sort by largest index first
    return bIndex - aIndex;
  }
}
