import { AssistantPreview, Page } from "@dust-tt/sparkle";
import { usePublicAgentConfigurations } from "@extension/components/assistants/usePublicAgentConfigurations";
import { InputBarContext } from "@extension/components/input_bar/InputBarContext";
import { useCallback, useContext } from "react";

export function AssistantFavorites() {
  const {
    agentConfigurations,
    isAgentConfigurationsLoading,
    isAgentConfigurationsError,
  } = usePublicAgentConfigurations("favorites");

  const { setSelectedAssistant } = useContext(InputBarContext);

  const handleAssistantClick = useCallback(
    (agentId: string) => {
      const scrollContainer = document.getElementById("assistant-input-header");
      if (!scrollContainer) {
        console.error("Scroll container not found");
        return;
      }

      const { top } = scrollContainer.getBoundingClientRect();
      if (top < -2) {
        scrollContainer.scrollIntoView({ behavior: "smooth" });
      }

      setSelectedAssistant({ configurationId: agentId });
    },
    [setSelectedAssistant]
  );

  if (isAgentConfigurationsError || isAgentConfigurationsLoading) {
    return null;
  }

  return (
    <div className="text-left w-full pt-2 pb-12">
      <Page.SectionHeader title="Favorites" />
      <div className="relative grid w-full grid-cols-1 sm:grid-cols-2 gap-2">
        {agentConfigurations.map(
          ({ sId, name, pictureUrl, lastAuthors, description }) => (
            <AssistantPreview
              key={sId}
              title={name}
              pictureUrl={pictureUrl}
              subtitle={lastAuthors?.join(", ") ?? ""}
              description={description}
              variant="minimal"
              onClick={() => handleAssistantClick(sId)}
              hasAction={false}
            />
          )
        )}
      </div>
    </div>
  );
}
