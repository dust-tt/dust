import { Button, DropdownMenu, RobotIcon } from "@dust-tt/sparkle";

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
  agentConfigurations.sort((a, b) => compareAgentSuggestions(a, b));

  return (
    <div className="pt-4">
      <div className="text-xs font-bold text-element-600">
        Which KillerZorg would you like to talk with?
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button.List>
          {agentConfigurations.slice(0, 3).map((agent) => (
            <Button
              key={`message-${userMessage.sId}-suggestion-${agent.sId}`}
              size="xs"
              variant="avatar"
              label={`@${agent.name}`}
              onClick={() => selectSuggestionHandler(agent)}
              avatar={agent.pictureUrl}
            />
          ))}
        </Button.List>
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
            <DropdownMenu.Items origin="topLeft" width={240}>
              {agentConfigurations.slice(3).map((agent) => (
                <DropdownMenu.Item
                  key={`message-${userMessage.sId}-suggestion-${agent.sId}`}
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

  async function selectSuggestionHandler(agent: AgentConfigurationType) {
    const editedContent = `:mention[${agent.name}]{sId=${agent.sId}} ${userMessage.content}`;
    await fetch(
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
  }

  /**
   * Compare agents by whom was last mentioned in conversation from this user.
   * If none has been mentioned, dust comes first, then gpt4 , then custom
   * agents (in any order), then global agents with a specific source, then
   * claude, then the rest
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
    //
    if (aIndex === -1 && bIndex === -1) {
      // if neither a nor b was mentioned, dust comes first, then gpt4
      if (a.name === "Dust") {
        return -1;
      }
      if (b.name === "Dust") {
        return 1;
      }
      if (a.name === "gpt4") {
        return -1;
      }
      if (b.name === "gpt4") {
        return 1;
      }
      // custom agents come next
      if (a.scope === "workspace") {
        return -1;
      }
      if (b.scope === "workspace") {
        return 1;
      }
      // datasource-specific global agents come next
      if (a.action?.dataSources.length === 1) {
        return -1;
      }
      if (a.action?.dataSources.length === 1) {
        return 1;
      }
      // claude comes next
      if (a.name === "claude") {
        return -1;
      }
      if (b.name === "claude") {
        return 1;
      }
      // the rest
      return 0;
    }

    // if a or b was mentioned, sort by largest index first
    return bIndex - aIndex;
  }
}
