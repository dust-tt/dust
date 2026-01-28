/**
 * Markdown directive plugin for copilot suggestions.
 *
 * This module provides remark-directive plugins for parsing and rendering
 * suggestion directives in markdown content, enabling the :agent_suggestion[]{sId=xxx kind=yyy} syntax.
 */

import React from "react";
import { visit } from "unist-util-visit";

import { useCopilotSuggestions } from "@app/components/agent_builder/copilot/CopilotSuggestionsContext";
import {
  CopilotSuggestionCard,
  SuggestionCardError,
  SuggestionCardSkeleton,
} from "@app/components/markdown/suggestion/CopilotSuggestionCard";
import type { AgentSuggestionKind } from "@app/types/suggestions/agent_suggestion";

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
  sId: string;
  kind: AgentSuggestionKind;
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
    const { getBackendSuggestion, isSuggestionsLoading } =
      useCopilotSuggestions();

    if (isSuggestionsLoading || !sId) {
      return <SuggestionCardSkeleton kind={kind} />;
    }

    const suggestionData = getBackendSuggestion(sId);

    if (!suggestionData) {
      return <SuggestionCardError />;
    }

    return <CopilotSuggestionCard agentSuggestion={suggestionData} />;
  };

  return CopilotSuggestionPlugin;
}
