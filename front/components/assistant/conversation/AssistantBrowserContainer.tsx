import { Page } from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { useCallback } from "react";

import { AssistantBrowser } from "@app/components/assistant/AssistantBrowser";
import { useProgressiveAgentConfigurations } from "@app/lib/swr/assistants";
import { classNames } from "@app/lib/utils";

interface AssistantBrowserContainerProps {
  onAgentConfigurationClick: (agentId: string) => void;
  owner: WorkspaceType;
  isBuilder: boolean;
  setAssistantToMention: (agent: LightAgentConfigurationType) => void;
}

export function AssistantBrowserContainer({
  onAgentConfigurationClick,
  owner,
  isBuilder,
  setAssistantToMention,
}: AssistantBrowserContainerProps) {
  const { agentConfigurations, isLoading } = useProgressiveAgentConfigurations({
    workspaceId: owner.sId,
  });

  const handleAssistantClick = useCallback(
    // On click, scroll to the input bar and set the selected assistant.
    async (agent: LightAgentConfigurationType) => {
      const scrollContainerElement = document.getElementById(
        "assistant-input-header"
      );

      if (!scrollContainerElement) {
        console.log("Unexpected: scrollContainerElement not found");
        return;
      }
      const scrollDistance = scrollContainerElement.getBoundingClientRect().top;

      // If the input bar is already in view, set the mention directly. We leave
      // a little margin, -2 instead of 0, since the autoscroll below can
      // sometimes scroll a bit over 0, to -0.3 or -0.5, in which case if there
      // is a clic on a visible assistant we still want this condition to
      // trigger.
      if (scrollDistance > -2) {
        return onAgentConfigurationClick(agent.sId);
      }

      // Otherwise, scroll to the input bar and set the ref (mention will be set via intersection observer).
      scrollContainerElement.scrollIntoView({ behavior: "smooth" });

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
        isBuilder={isBuilder}
        agents={agentConfigurations}
        loadingStatus={isLoading ? "loading" : "finished"}
        handleAssistantClick={handleAssistantClick}
      />
    </div>
  );
}
