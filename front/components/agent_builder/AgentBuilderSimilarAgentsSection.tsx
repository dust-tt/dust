import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useDebounceWithAbort } from "@app/hooks/useDebounce";
import { LinkWrapper } from "@app/lib/platform";
import {
  useAgentConfigurations,
  useSimilarAgents,
} from "@app/lib/swr/assistants";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { Avatar, Icon, LinkExternal01, Spinner } from "@dust-tt/sparkle";
import { useCallback, useEffect, useState } from "react";
import { useWatch } from "react-hook-form";

const DEBOUNCE_DELAY_MS = 250;
const MIN_DESCRIPTION_LENGTH = 10;

interface AgentBuilderSimilarAgentsSectionProps {
  agentConfigurationId: string | null;
}

export function AgentBuilderSimilarAgentsSection({
  agentConfigurationId,
}: AgentBuilderSimilarAgentsSectionProps) {
  const { owner } = useAgentBuilderContext();
  const isCreatingNew = !agentConfigurationId;

  const description = useWatch<
    AgentBuilderFormData,
    "agentSettings.description"
  >({ name: "agentSettings.description" });

  const { getSimilarAgents } = useSimilarAgents({ owner });
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: isCreatingNew ? "list" : null,
  });

  const [similarAgents, setSimilarAgents] = useState<
    LightAgentConfigurationType[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const fetchSimilarAgents = useCallback(
    async (naturalDescription: string, signal: AbortSignal) => {
      if (naturalDescription.length < MIN_DESCRIPTION_LENGTH) {
        setSimilarAgents([]);
        setIsLoading(false);
        setHasError(false);
        return;
      }

      setIsLoading(true);
      setHasError(false);

      try {
        const result = await getSimilarAgents(naturalDescription, { signal });

        if (signal.aborted) {
          return;
        }

        setIsLoading(false);
        if (result.isOk()) {
          const similarAgentIds = new Set(result.value);
          setSimilarAgents(
            agentConfigurations.filter((agent) =>
              similarAgentIds.has(agent.sId)
            )
          );
        }
      } catch {
        if (signal.aborted) {
          return;
        }
        setIsLoading(false);
        setHasError(true);
      }
    },
    [agentConfigurations, getSimilarAgents]
  );

  const triggerSimilarAgentsFetch = useDebounceWithAbort(fetchSimilarAgents, {
    delayMs: DEBOUNCE_DELAY_MS,
  });

  useEffect(() => {
    if (!isCreatingNew) {
      return;
    }

    const naturalDescription = description ?? "";

    // Reflect the pending state immediately so the "Checking..." indicator
    // shows up as soon as typing stops, rather than only once the debounce
    // delay has elapsed and the request has actually started.
    if (naturalDescription.length < MIN_DESCRIPTION_LENGTH) {
      setIsLoading(false);
      setHasError(false);
      setSimilarAgents([]);
    } else {
      setIsLoading(true);
      setHasError(false);
    }

    triggerSimilarAgentsFetch(naturalDescription);
  }, [description, isCreatingNew, triggerSimilarAgentsFetch]);

  if (!isCreatingNew) {
    return null;
  }

  if (hasError) {
    return (
      <div className="text-sm text-muted-foreground">
        Couldn&apos;t check for similar agents.
      </div>
    );
  }

  if (similarAgents.length === 0 && !isLoading) {
    return null;
  }

  if (similarAgents.length === 0 && isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner size="xs" />
        <span>Checking for similar agents...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="heading-sm text-foreground">Similar agents found</span>
        {isLoading && <Spinner size="xs" />}
      </div>
      <div className="space-y-3">
        {similarAgents.map((agent) => (
          <div key={agent.sId} className="flex items-start gap-3">
            <Avatar visual={agent.pictureUrl} size="sm" />
            <div className="flex flex-col">
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium text-foreground">
                  {agent.name}
                </span>
                <LinkWrapper
                  href={getAgentBuilderRoute(owner.sId, agent.sId)}
                  target="_blank"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Icon visual={LinkExternal01} size="xs" />
                </LinkWrapper>
              </div>
              <span className="line-clamp-1 text-xs text-muted-foreground">
                {agent.description}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
