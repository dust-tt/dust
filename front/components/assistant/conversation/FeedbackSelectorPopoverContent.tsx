import { Page } from "@dust-tt/sparkle";

import { useAgentConfigurationLastAuthor } from "@app/lib/swr/assistants";
import type { AgentMessageType, LightWorkspaceType } from "@app/types";

interface FeedbackSelectorPopoverContentProps {
  agentMessageToRender: AgentMessageType;
  owner: LightWorkspaceType;
}

export function FeedbackSelectorPopoverContent({
  owner,
  agentMessageToRender,
}: FeedbackSelectorPopoverContentProps) {
  const { agentLastAuthor } = useAgentConfigurationLastAuthor({
    workspaceId: owner.sId,
    agentConfigurationId: agentMessageToRender.configuration.sId,
  });

  return (
    agentLastAuthor && (
      <div className="mb-4 mt-2 flex flex-col gap-2">
        <Page.P variant="secondary">
          Your feedback is available to editors of the agent. The last agent
          editor is:
        </Page.P>
        <div className="flex flex-row items-center gap-2">
          {agentLastAuthor.image && (
            <img
              src={agentLastAuthor.image}
              alt={agentLastAuthor.firstName}
              className="h-8 w-8 rounded-full"
            />
          )}
          <Page.P variant="primary">
            {agentLastAuthor.firstName} {agentLastAuthor.lastName}
          </Page.P>
        </div>
      </div>
    )
  );
}
