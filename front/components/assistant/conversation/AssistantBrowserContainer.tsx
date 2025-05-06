import { Page } from "@dust-tt/sparkle";
import { useCallback } from "react";

import { AssistantBrowser } from "@app/components/assistant/AssistantBrowser";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import { classNames } from "@app/lib/utils";
import type { LightAgentConfigurationType, WorkspaceType } from "@app/types";

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
  // We use this specific hook because this component is involved in the new conversation page.
  const { agentConfigurations, isLoading } = useUnifiedAgentConfigurations({
    workspaceId: owner.sId,
  });

  const handleAssistantClick = useCallback(
    // On click, scroll to the input bar and set the selected agent.
    async (agent: LightAgentConfigurationType) => {
      const scrollContainerElement = document.getElementById(
        "assistant-input-header"
      );

      if (!scrollContainerElement) {
        console.log("Unexpected: scrollContainerElement not found");
        return;
      }
      const scrollDistance = scrollContainerElement.getBoundingClientRect().top;

      // If the input bar is already in view, set the mention directly. We leave a little margin, -2
      // instead of 0, since the autoscroll below can sometimes scroll a bit over 0, to -0.3 or
      // -0.5, in which case if there is a clic on a visible agent we still want this condition
      // to trigger.
      if (scrollDistance > -2) {
        return onAgentConfigurationClick(agent.sId);
      }

      // Otherwise, scroll to the input bar and set the ref (mention will be set via intersection
      // observer).
      scrollContainerElement.scrollIntoView({ behavior: "smooth" });

      setAssistantToMention(agent);
    },
    [setAssistantToMention, onAgentConfigurationClick]
  );

  return (
    <div
      id="assistants-lists-container"
      className={classNames(
        "duration-400 flex h-full w-full max-w-4xl flex-col gap-2 pt-8 transition-opacity",
        isLoading ? "opacity-0" : "opacity-100"
      )}
    >
      <div id="assistants-list-header">
        <Page.SectionHeader title="Chat with..." />
      </div>
      <AssistantBrowser
        owner={owner}
        agentConfigurations={agentConfigurations}
        isLoading={isLoading}
        handleAssistantClick={handleAssistantClick}
      />
    </div>
  );
}
