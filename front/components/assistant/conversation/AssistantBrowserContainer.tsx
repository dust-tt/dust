import { Page } from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { useCallback } from "react";

import { AssistantBrowser } from "@app/components/assistant/AssistantBrowser";
import { useProgressiveAgentConfigurations } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

interface AssistantBrowserContainerProps {
  onAgentConfigurationClick: (agentId: string) => void;
  owner: WorkspaceType;
  setAssistantToMention: (agent: LightAgentConfigurationType) => void;
}

export function AssistantBrowserContainer({
  onAgentConfigurationClick,
  owner,
  setAssistantToMention,
}: AssistantBrowserContainerProps) {
  const { agentConfigurations, isLoading, mutateAgentConfigurations } =
    useProgressiveAgentConfigurations({
      workspaceId: owner.sId,
    });

  const handleAssistantClick = useCallback(
    async (agent: LightAgentConfigurationType) => {
      onAgentConfigurationClick(agent.sId);
      setAssistantToMention(agent);
    },
    [setAssistantToMention, onAgentConfigurationClick]
  );

  return (
    <div
      id="assistants-lists-container"
      className={classNames(
        "duration-400 flex h-full w-full max-w-4xl flex-col gap-3 pt-9 transition-opacity",
        isLoading ? "opacity-0" : "opacity-100"
      )}
    >
      <div id="assistants-list-header" className="px-4">
        <Page.SectionHeader title="Chat with..." />
      </div>
      <AssistantBrowser
        owner={owner}
        agents={agentConfigurations}
        loadingStatus={isLoading ? "loading" : "finished"}
        handleAssistantClick={handleAssistantClick}
        mutateAgentConfigurations={mutateAgentConfigurations}
      />
    </div>
  );
}
