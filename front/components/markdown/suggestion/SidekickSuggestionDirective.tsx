/**
 * Markdown directive plugin for sidekick suggestions.
 *
 * This module provides remark-directive plugins for parsing and rendering
 * suggestion directives in markdown content, enabling the :agent_suggestion[]{sId=xxx kind=yyy} syntax.
 */

import { useSidekickSuggestions } from "@app/components/agent_builder/sidekick/SidekickSuggestionsContext";
import {
  SidekickSuggestionCard,
  SuggestionCardSkeleton,
} from "@app/components/markdown/suggestion/SidekickSuggestionCard";
import type { AgentSuggestionKind } from "@app/types/suggestions/agent_suggestion";
import { useEffect } from "react";
import { SKIP, visit } from "unist-util-visit";

/**
 * Remark directive plugin for parsing sidekick suggestion directives.
 *
 * Transforms `:agent_suggestion[]{sId=xxx kind=yyy}` into a custom HTML element
 * that can be rendered by the suggestion card component.
 */
export function sidekickSuggestionDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective", "leafDirective"], (node) => {
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

    // Models may not output a newline before the directive
    // (e.g. "issues::agent_suggestion[]{sId=xxx kind=yyy}" — the prefix
    // prevents remarkDirective from parsing it). We drop the prefix and render the directive.
    visit(tree, "text", (node, index, parent) => {
      if (!parent || index === null) {
        return;
      }
      const match = /::agent_suggestion\[\]\{([^}]*)\}/.exec(node.value);
      if (!match) {
        return;
      }
      const attrs = Object.fromEntries(
        [...match[1].matchAll(/(\w+)=([^\s}]+)/g)].map((m) => [m[1], m[2]])
      );
      // Replace the entire text node (incl. leaked prefix) with a leafDirective node.
      parent.children = [
        ...parent.children.slice(0, index),
        {
          type: "leafDirective",
          name: "agent_suggestion",
          attributes: attrs,
          children: [],
          data: { hName: "agent_suggestion", hProperties: attrs },
        },
        ...parent.children.slice(index + 1),
      ];

      return [SKIP, index];
    });
  };
}

interface SidekickSuggestionPluginProps {
  sId?: string;
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
    sId,
    kind,
  }: SidekickSuggestionPluginProps) => {
    const {
      getSuggestionWithRelations,
      triggerRefetch,
      isSuggestionsValidating,
      hasAttemptedRefetch,
    } = useSidekickSuggestions();

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

    return (
      <div data-suggestion-s-id={sId}>
        <SidekickSuggestionCard agentSuggestion={suggestion} />
      </div>
    );
  };

  return SidekickSuggestionPlugin;
}
