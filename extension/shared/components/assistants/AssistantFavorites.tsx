import { AssistantCard, Button, CardGrid, Page } from "@dust-tt/sparkle";
import { usePublicAgentConfigurations } from "@extension/components/assistants/usePublicAgentConfigurations";
import { InputBarContext } from "@extension/components/input_bar/InputBarContext";
import type { StoredUser } from "@extension/lib/storage";
import { useCallback, useContext } from "react";

type AssistantFavoritesProps = {
  user: StoredUser;
};

export function AssistantFavorites({ user }: AssistantFavoritesProps) {
  const {
    agentConfigurations,
    isAgentConfigurationsLoading,
    isAgentConfigurationsError,
  } = usePublicAgentConfigurations("favorites", ["authors"]);

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

  const hasFavorites = agentConfigurations.length > 0;

  return (
    <div className="h-full w-full pt-2 pb-12">
      <Page.SectionHeader title="Favorites" />
      {hasFavorites ? (
        <CardGrid className="mb-12">
          {agentConfigurations.map(
            ({ sId, name, pictureUrl, lastAuthors, description }) => (
              <AssistantCard
                key={sId}
                title={name}
                pictureUrl={pictureUrl}
                subtitle={lastAuthors?.join(", ") ?? ""}
                description={description}
                onClick={() => handleAssistantClick(sId)}
              />
            )
          )}
        </CardGrid>
      ) : (
        <div className="flex flex-col items-center pt-20 gap-4">
          <p className="text-slate-400 dark:text-slate-400-night">
            Your favorite agents will appear here
          </p>
          <Button
            label="Add favorites on Dust"
            href={`${user.dustDomain}`}
            target="_blank"
          />
        </div>
      )}
    </div>
  );
}
