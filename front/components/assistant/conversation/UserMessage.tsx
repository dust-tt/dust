import React from "react";

import { ConversationMessage } from "@app/components/assistant/conversation/ConversationMessage";
import { RenderMarkdown } from "@app/components/RenderMarkdown";
import { UserMessageType } from "@app/types/assistant/conversation";
import { Button, DropdownMenu, RobotIcon, SlackLogo } from "@dust-tt/sparkle";
import { useAgentConfigurations } from "@app/lib/swr";

export function UserMessage({ message }: { message: UserMessageType }) {
  return (
    <ConversationMessage
      pictureUrl={message.context.profilePictureUrl}
      name={message.context.fullName}
      messageId={message.sId}
    >
      <div className="flex flex-col gap-4">
        <RenderMarkdown content={message.content} />
        {message.mentions.length === 0 && (
          <AgentSuggestion workspaceId="ee4d3cb9e7" />
        )}
      </div>
    </ConversationMessage>
  );
}

function AgentSuggestion({ workspaceId }: { workspaceId: string }) {
  const { agentConfigurations } = useAgentConfigurations({ workspaceId });
  // TODO
  // Sort agents by lastly used in conversation, then pick 3 at random
  return (
    <div className="mt-2">
      <div className="text-xs font-bold text-element-600">
        Which KillerZorg would you like to talk with?
      </div>
      <div className="mt-2 flex items-center gap-2">
        {agentConfigurations.slice(0, 3).map((agent) => (
          <Button
            size="xs"
            variant="tertiary"
            label={`@${agent.name}`}
            onClick={() => console.log(agent)}
            icon={() => (
              <img
                className="h-5 w-5 rounded rounded-xl"
                src={agent.pictureUrl}
              />
            )}
          />
        ))}
        <DropdownMenu>
          <DropdownMenu.Button>
            <Button
              variant="tertiary"
              size="xs"
              icon={RobotIcon}
              label="Select another"
            />
          </DropdownMenu.Button>
          <div className="relative bottom-6 z-30">
            <DropdownMenu.Items origin="topLeft" width={320}>
              {agentConfigurations.slice(3).map((agent) => (
                <DropdownMenu.Item
                  label={agent.name}
                  visual={agent.pictureUrl}
                />
              ))}
            </DropdownMenu.Items>
          </div>
        </DropdownMenu>
      </div>
    </div>
  );
}
