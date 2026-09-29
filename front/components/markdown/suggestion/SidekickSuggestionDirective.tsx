/**
 * Markdown directive and component plugin rendering agent suggestions inside the agent builder's
 * Sidekick.
 */

import { useSidekickSuggestions } from "@app/components/agent_builder/sidekick/SidekickSuggestionsContext";
import {
  SidekickSuggestionCard,
  SuggestionCardSkeleton,
} from "@app/components/markdown/suggestion/SidekickSuggestionCard";
import { makeDirective } from "@app/components/markdown/suggestion/suggestionDirective";
import type { AgentSuggestionKind } from "@app/types/suggestions/agent_suggestion";
import { useEffect } from "react";

/**
 * Remark directive plugin parsing `:agent_suggestion[]{sId=xxx kind=yyy}` into the element the
 * component plugin below renders.
 */
export const sidekickSuggestionDirective = makeDirective(
  "agent_suggestion",
  (attributes) => ({ suggestionId: attributes.sId, kind: attributes.kind })
);

interface SidekickSuggestionPluginProps {
  suggestionId?: string;
  kind?: AgentSuggestionKind;
}

/**
 * Creates a React component plugin for rendering sidekick suggestions in markdown.
 *
 * This function returns a component that can be used as a custom component
 * in ReactMarkdown to render the sidekick suggestion HTML elements.
 */
export function getSidekickSuggestionPlugin() {
  const SidekickSuggestionPlugin = ({
    suggestionId,
    kind,
  }: SidekickSuggestionPluginProps) => {
    const {
      getSuggestionWithRelations,
      triggerRefetch,
      isSuggestionsValidating,
      hasAttemptedRefetch,
    } = useSidekickSuggestions();

    const suggestion = suggestionId
      ? getSuggestionWithRelations(suggestionId)
      : null;

    // Trigger refetch when suggestion not found and not currently fetching.
    // triggerRefetch queues the sId and marks it as attempted after fetch completes.
    useEffect(() => {
      if (
        suggestionId &&
        !suggestion &&
        !isSuggestionsValidating &&
        !hasAttemptedRefetch(suggestionId)
      ) {
        triggerRefetch(suggestionId);
      }
    }, [
      suggestionId,
      suggestion,
      isSuggestionsValidating,
      triggerRefetch,
      hasAttemptedRefetch,
    ]);

    if (!suggestionId || !kind) {
      return <SuggestionCardSkeleton kind={kind} />;
    }

    if (!suggestion) {
      // Show skeleton while validating or haven't completed a refetch attempt
      if (isSuggestionsValidating || !hasAttemptedRefetch(suggestionId)) {
        return <SuggestionCardSkeleton kind={kind} />;
      }
      // Don't show anything for suggestions that no longer exist (outdated/deleted)
      return null;
    }

    return (
      <div data-suggestion-s-id={suggestionId}>
        <SidekickSuggestionCard agentSuggestion={suggestion} />
      </div>
    );
  };

  return SidekickSuggestionPlugin;
}
