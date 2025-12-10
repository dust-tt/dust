import type { StoredUser } from "@app/shared/services/auth";
import { usePublicAgentConfigurations } from "@app/ui/components/agents/usePublicAgentConfigurations";
import { InputBarContext } from "@app/ui/components/input_bar/InputBarContext";
import { AssistantCard, Button, CardGrid, Page } from "@dust-tt/sparkle";
import { useCallback, useContext } from "react";

interface AgentFavoritesProps {
  user: StoredUser;
}

export function AgentFavorites({ user }: AgentFavoritesProps) {
  const {
    agentConfigurations,
    isAgentConfigurationsLoading,
    isAgentConfigurationsError,
  } = usePublicAgentConfigurations("favorites", ["authors"]);

  const { setSelectedAgent } = useContext(InputBarContext);
  const handleAgentClick = useCallback(
    (agentId: string) => {
      const scrollContainer = document.getElementById("agent-input-header");
      if (!scrollContainer) {
        console.error("Scroll container not found");
        return;
      }

      const { top } = scrollContainer.getBoundingClientRect();
      if (top < -2) {
        scrollContainer.scrollIntoView({ behavior: "smooth" });
      }

      setSelectedAgent({ configurationId: agentId });
    },
    [setSelectedAgent]
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
                onClick={() => handleAgentClick(sId)}
              />
            )
          )}
        </CardGrid>
      ) : (
        <div className="flex flex-col items-center pt-20 gap-4">
          <p className="text-muted-foreground dark:text-muted-foreground-night">
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
