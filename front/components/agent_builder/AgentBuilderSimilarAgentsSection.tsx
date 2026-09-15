import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import { useDebounceWithAbort } from "@app/hooks/useDebounce";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import {
  useAgentConfigurations,
  useSimilarAgents,
} from "@app/lib/swr/assistants";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { Avatar, cn, Spinner } from "@dust-tt/sparkle";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useWatch } from "react-hook-form";

// getSimilarAgents runs an LLM call under the hood, so the debounce needs to
// be long enough to not fire on every pause while drafting instructions.
const DEBOUNCE_DELAY_MS = 1_000;
const MIN_INSTRUCTIONS_LENGTH = 30;

type State = {
  similarAgents: LightAgentConfigurationType[];
  isLoading: boolean;
  hasError: boolean;
};

type Action =
  | { type: "reset" }
  | { type: "fetch_start" }
  | { type: "fetch_success"; similarAgents: LightAgentConfigurationType[] }
  | { type: "fetch_settled" }
  | { type: "fetch_error" };

const initialState: State = {
  similarAgents: [],
  isLoading: false,
  hasError: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset":
      return { ...state, similarAgents: [], isLoading: false, hasError: false };

    case "fetch_start":
      return { ...state, isLoading: true, hasError: false };

    case "fetch_success":
      return {
        ...state,
        isLoading: false,
        similarAgents: action.similarAgents,
      };

    case "fetch_settled":
      return { ...state, isLoading: false };

    case "fetch_error":
      return { ...state, isLoading: false, hasError: true };

    default:
      assertNeverAndIgnore(action);
      return state;
  }
}

interface AgentBuilderSimilarAgentsSectionProps {
  agentConfigurationId: string | null;
}

export function AgentBuilderSimilarAgentsSection({
  agentConfigurationId,
}: AgentBuilderSimilarAgentsSectionProps) {
  const { owner, user } = useAgentBuilderContext();
  const { hasFeature } = useFeatureFlags();
  const isCreatingNew = !agentConfigurationId;
  const isSimilarAgentsCheckEnabled = hasFeature("similar_agents_check");
  const [displayedAgentId, setDisplayedAgentId] = useState<string | null>(null);

  const instructions = useWatch<AgentBuilderFormData, "instructions">({
    name: "instructions",
  });

  const { getSimilarAgents } = useSimilarAgents({ owner });
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: isCreatingNew && isSimilarAgentsCheckEnabled ? "list" : null,
  });

  const [state, dispatch] = useReducer(reducer, initialState);
  const { similarAgents, isLoading, hasError } = state;

  // Avoids re-fetching (an LLM call) when the debounced value is unchanged
  // from the last one actually sent, e.g. after an undo/redo round-trip.
  const lastFetchedInstructionsRef = useRef<string | null>(null);

  const fetchSimilarAgents = useCallback(
    async (currentInstructions: string, signal: AbortSignal) => {
      if (currentInstructions.length < MIN_INSTRUCTIONS_LENGTH) {
        lastFetchedInstructionsRef.current = null;
        dispatch({ type: "reset" });
        return;
      }

      if (currentInstructions === lastFetchedInstructionsRef.current) {
        dispatch({ type: "fetch_settled" });
        return;
      }
      lastFetchedInstructionsRef.current = currentInstructions;

      dispatch({ type: "fetch_start" });

      const result = await getSimilarAgents(currentInstructions, { signal });

      if (signal.aborted) {
        return;
      }

      if (result.isErr()) {
        // Clear the dedup marker so the same instructions can be retried.
        lastFetchedInstructionsRef.current = null;
        dispatch({ type: "fetch_error" });
        return;
      }

      const similarAgentIds = new Set(result.value);
      dispatch({
        type: "fetch_success",
        similarAgents: agentConfigurations.filter((agent) =>
          similarAgentIds.has(agent.sId)
        ),
      });
    },
    [agentConfigurations, getSimilarAgents]
  );

  const triggerSimilarAgentsFetch = useDebounceWithAbort(fetchSimilarAgents, {
    delayMs: DEBOUNCE_DELAY_MS,
  });

  useEffect(() => {
    if (!isCreatingNew || !isSimilarAgentsCheckEnabled) {
      return;
    }

    const currentInstructions = instructions ?? "";

    // Reflect the pending state immediately so the "Checking..." indicator
    // shows up as soon as typing stops, rather than only once the debounce
    // delay has elapsed and the request has actually started.
    if (currentInstructions.length < MIN_INSTRUCTIONS_LENGTH) {
      dispatch({ type: "reset" });
    } else {
      dispatch({ type: "fetch_start" });
    }

    triggerSimilarAgentsFetch(currentInstructions);
  }, [
    instructions,
    isCreatingNew,
    isSimilarAgentsCheckEnabled,
    triggerSimilarAgentsFetch,
  ]);

  if (!isCreatingNew || !isSimilarAgentsCheckEnabled) {
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
        <span>Checking for similar agents…</span>
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
          <button
            key={agent.sId}
            type="button"
            onClick={() => setDisplayedAgentId(agent.sId)}
            className={cn(
              "group flex w-full cursor-pointer items-start gap-3 rounded-md text-left",
              "outline-hidden ring-offset-background",
              "focus-visible:ring-2 focus-visible:ring-highlight-300 focus-visible:ring-offset-1"
            )}
          >
            <Avatar visual={agent.pictureUrl} size="sm" />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground pointer-fine:group-hover:underline">
                {agent.name}
              </span>
              <span className="line-clamp-1 text-xs text-muted-foreground">
                {agent.description}
              </span>
            </div>
          </button>
        ))}
      </div>
      <AgentDetailsSheet
        owner={owner}
        user={user}
        agentId={displayedAgentId}
        onClose={() => setDisplayedAgentId(null)}
      />
    </div>
  );
}
