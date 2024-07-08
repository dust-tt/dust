import {
  AssistantPreview,
  Button,
  RobotIcon,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  UserMessageType,
  WorkspaceType,
} from "@dust-tt/types";
import { useContext, useState } from "react";

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { compareAgentsForSort } from "@app/lib/assistant";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useAgentConfigurations } from "@app/lib/swr";

interface AgentSuggestion {
  conversationId: string;
  latestMentions: string[];
  owner: WorkspaceType;
  userMessage: UserMessageType;
}

export function AgentSuggestion({
  conversationId,
  latestMentions,
  owner,
  userMessage,
}: AgentSuggestion) {
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: { conversationId: conversationId },
    includes: ["authors"],
  });
  const sendNotification = useContext(SendNotificationsContext);

  const compareFctn = createCompareAgentSuggestions(latestMentions);
  const agents = agentConfigurations
    .filter((a) => a.status === "active")
    .sort(compareFctn);

  const [loading, setLoading] = useState(false);

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
        window.alert(`Error adding mention to message: ${data.error.message}`);
        sendNotification({
          type: "error",
          title: "Invite sent",
          description: `Error adding mention to message: ${data.error.message}`,
        });
      }
    }
  );

  return (
    <div className="pt-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-element-600">
          Which Assistant would you like to talk with?
        </span>
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
              type="menu"
            />
          }
        />
      </div>

      {agents.length === 0 ? (
        <div className="flex h-full min-h-28 w-full items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {agents.slice(0, 3).map((agent, id) => (
            <AssistantPreview
              key={`${agent.sId}-${id}`}
              variant="minimal"
              description={agent.description}
              subtitle={agent.lastAuthors?.join(", ") ?? ""}
              title={agent.name}
              pictureUrl={agent.pictureUrl}
              onClick={() => handleSelectSuggestion(agent)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Compare agents by whom was last mentioned in conversation from this user. If none has been
 * mentioned, use the shared `compareAgentsForSort` function.
 */
function createCompareAgentSuggestions(latestMentions: string[]) {
  return (a: LightAgentConfigurationType, b: LightAgentConfigurationType) => {
    const aIndex = latestMentions.findIndex((id) => id === a.sId);
    const bIndex = latestMentions.findIndex((id) => id === b.sId);

    // If both a and b have been mentioned, sort by largest index first.
    // If only one has been mentioned, sort it first.
    // If neither has been mentioned, use the default comparison function.
    return (
      (aIndex !== -1 ? aIndex : Infinity) -
        (bIndex !== -1 ? bIndex : Infinity) || compareAgentsForSort(a, b)
    );
  };
}
