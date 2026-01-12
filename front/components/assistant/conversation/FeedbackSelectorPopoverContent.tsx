import { Avatar, Page } from "@dust-tt/sparkle";

import { useAgentConfigurationLastAuthor } from "@app/lib/swr/assistants";
import type { LightWorkspaceType } from "@app/types";

interface FeedbackSelectorPopoverContentProps {
  owner: LightWorkspaceType;
  agentConfigurationId: string;
  isGlobalAgent: boolean;
}

export function FeedbackSelectorPopoverContent({
  owner,
  agentConfigurationId,
  isGlobalAgent,
}: FeedbackSelectorPopoverContentProps) {
  const { agentLastAuthor } = useAgentConfigurationLastAuthor({
    workspaceId: owner.sId,
    agentConfigurationId,
  });

  if (isGlobalAgent) {
    return (
      <div className="mb-4 mt-2 flex flex-col gap-2">
        <Page.P variant="secondary">
          Submitting feedback will help Dust improve your global agents.
        </Page.P>
      </div>
    );
  }

  return (
    agentLastAuthor && (
      <div className="mb-4 mt-2 flex flex-col gap-2">
        <Page.P variant="secondary">
          <span>
            Your feedback is available to editors of the agent. The last agent
            editor is:{" "}
          </span>
          <span className="inline-flex items-center gap-2">
            {agentLastAuthor.image && (
              <Avatar visual={agentLastAuthor.image} size="sm" />
            )}
            <span className="font-medium text-foreground dark:text-foreground-night">
              {`${agentLastAuthor.firstName} ${agentLastAuthor.lastName}`}
            </span>
          </span>
        </Page.P>
      </div>
    )
  );
}
