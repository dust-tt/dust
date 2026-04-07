import { AgentBrowser } from "@app/components/assistant/conversation/agent_browser/AgentBrowser";
import { useClientType } from "@app/lib/context/clientType";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { classNames, smoothScrollIntoView } from "@app/lib/utils";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { UserType, WorkspaceType } from "@app/types/user";
import { Page } from "@dust-tt/sparkle";
import { useCallback } from "react";

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

  const clientType = useClientType();
  const isMobile = useIsMobile();
  const isMobileOrExtension = isMobile || clientType === "extension";

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
        "duration-400 flex h-full w-full max-w-conversation flex-col gap-2 py-8"
      )}
    >
      {!isMobileOrExtension && (
        <div id="agents-list-header">
          <Page.SectionHeader title="Chat with..." />
        </div>
      )}
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
