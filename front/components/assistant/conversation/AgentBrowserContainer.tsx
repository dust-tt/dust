import { AgentBrowser } from "@app/components/assistant/conversation/agent_browser/AgentBrowser";
import { scrollToAgentInputHeader } from "@app/components/assistant/conversation/scrollToAgentInputHeader";
import { useClientType } from "@app/lib/context/clientType";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { classNames } from "@app/lib/utils";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { UserType, WorkspaceType } from "@app/types/user";
import { Page } from "@dust-tt/sparkle";
import type { CSSProperties } from "react";
import { useCallback } from "react";

interface AgentBrowserContainerProps {
  onAgentConfigurationClick: (agent: LightAgentConfigurationType) => void;
  user: UserType;
  owner: WorkspaceType;
  // Entrance animation for the root element, e.g. the empty-state hero's
  // fade-rise-blur-in. Left undefined outside that one call site.
  style?: CSSProperties;
}

export function AgentBrowserContainer({
  onAgentConfigurationClick,
  owner,
  style,
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
    async (agent: LightAgentConfigurationType) => {
      await scrollToAgentInputHeader();
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
      style={style}
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
