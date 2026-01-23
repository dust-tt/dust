import { Page } from "@dust-tt/sparkle";
import { useCallback } from "react";

import { AgentBrowser } from "@app/components/assistant/AgentBrowser";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import { classNames, smoothScrollIntoView } from "@app/lib/utils";
import type {
  LightAgentConfigurationType,
  UserType,
  WorkspaceType,
} from "@app/types";

interface AgentBrowserContainerProps {
  onAgentConfigurationClick: (agent: LightAgentConfigurationType) => void;
  user: UserType;
  owner: WorkspaceType;
}

export function AgentBrowserContainer({
  onAgentConfigurationClick,
  owner,
  user,
}: AgentBrowserContainerProps) {
  // We use this specific hook because this component is involved in the new conversation page.
  const { agentConfigurations, isLoading } = useUnifiedAgentConfigurations({
    workspaceId: owner.sId,
  });

  const handleAgentClick = useCallback(
    // On click, scroll to the input bar and set the selected agent.
    async (agent: LightAgentConfigurationType) => {
      const scrollContainerElement =
        document.getElementById("agent-input-header");

      if (!scrollContainerElement) {
        console.log("Unexpected: scrollContainerElement not found");
        return;
      }

      await smoothScrollIntoView({
        element: scrollContainerElement,
      });

      onAgentConfigurationClick(agent);
    },
    [onAgentConfigurationClick]
  );

  return (
    <div
      id="agents-lists-container"
      className={classNames(
        "duration-400 flex h-full w-full max-w-3xl flex-col gap-2 py-8"
      )}
    >
      <div id="agents-list-header">
        <Page.SectionHeader title="Chat with..." />
      </div>
      <AgentBrowser
        owner={owner}
        agentConfigurations={agentConfigurations}
        isLoading={isLoading}
        handleAgentClick={handleAgentClick}
        user={user}
      />
      <div className="h-8 w-8 shrink-0" />
    </div>
  );
}
