/**
 * Markdown directive plugin for copilot suggestions.
 *
 * This module provides remark-directive plugins for parsing and rendering
 * suggestion directives in markdown content, enabling the :agent_suggestion[]{sId=xxx kind=yyy} syntax.
 */

import { useCopilotSuggestions } from "@app/components/agent_builder/copilot/CopilotSuggestionsContext";
import {
  CopilotSuggestionCard,
  SuggestionCardSkeleton,
} from "@app/components/markdown/suggestion/CopilotSuggestionCard";
import type { AgentSuggestionKind } from "@app/types/suggestions/agent_suggestion";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useEffect } from "react";
import { visit } from "unist-util-visit";

/**
 * Remark directive plugin for parsing copilot suggestion directives.
 *
 * Transforms `:agent_suggestion[]{sId=xxx kind=yyy}` into a custom HTML element
 * that can be rendered by the suggestion card component.
 */
export function copilotSuggestionDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.name === "agent_suggestion") {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const data = node.data || (node.data = {});
        data.hName = "agent_suggestion";
        data.hProperties = {
          sId: node.attributes.sId,
          kind: node.attributes.kind,
        };
      }
    });
  };
}

interface CopilotSuggestionPluginProps {
  sId?: string;
  kind?: AgentSuggestionKind;
}

/**
 * Creates a React component plugin for rendering copilot suggestions in markdown.
 *
 * This function returns a component that can be used as a custom component
 * in ReactMarkdown to render the copilot suggestion HTML elements.
 */
export function getCopilotSuggestionPlugin() {
  const CopilotSuggestionPlugin = ({
    sId,
    kind,
  }: CopilotSuggestionPluginProps) => {
    const {
      getSuggestionWithRelations,
      triggerRefetch,
      isSuggestionsValidating,
      hasAttemptedRefetch,
    } = useCopilotSuggestions();

    const suggestion = sId ? getSuggestionWithRelations(sId) : null;

    // Trigger refetch when suggestion not found and not currently fetching.
    // triggerRefetch queues the sId and marks it as attempted after fetch completes.
    useEffect(() => {
      if (
        sId &&
        !suggestion &&
        !isSuggestionsValidating &&
        !hasAttemptedRefetch(sId)
      ) {
        triggerRefetch(sId);
      }
    }, [
      sId,
      suggestion,
      isSuggestionsValidating,
      triggerRefetch,
      hasAttemptedRefetch,
    ]);

    if (!sId || !kind) {
      return <SuggestionCardSkeleton kind={kind} />;
    }

    if (!suggestion) {
      // Show skeleton while validating or haven't completed a refetch attempt
      if (isSuggestionsValidating || !hasAttemptedRefetch(sId)) {
        return <SuggestionCardSkeleton kind={kind} />;
      }
      // Don't show anything for suggestions that no longer exist (outdated/deleted)
      return null;
    }

    return <CopilotSuggestionCard agentSuggestion={suggestion} />;
  };

  return CopilotSuggestionPlugin;
}
