/**
 * Markdown directive plugin for suggestions.
 *
 * This module provides remark-directive plugins for parsing and rendering
 * suggestion directives in markdown content, enabling the :agentMessageSuggestion[]{sId=xxx kind=yyy} syntax.
 */

import React from "react";
import { visit } from "unist-util-visit";

import { useCopilotSuggestions } from "@app/components/agent_builder/copilot/CopilotSuggestionsContext";
import {
  AgentMessageSuggestionCard,
  SuggestionCardError,
  SuggestionCardSkeleton,
} from "@app/components/markdown/suggestion/AgentMessageSuggestionCard";
import type { AgentSuggestionKind } from "@app/types/suggestions/agent_suggestion";

/**
 * Remark directive plugin for parsing agent message suggestion directives.
 *
 * Transforms `:agentMessageSuggestion[]{sId=xxx kind=yyy}` into a custom HTML element
 * that can be rendered by the suggestion card component.
 */
export function agentMessageSuggestionDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.name === "agentMessageSuggestion") {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const data = node.data || (node.data = {});
        data.hName = "agentMessageSuggestion";
        data.hProperties = {
          sId: node.attributes.sId,
          kind: node.attributes.kind,
        };
      }
    });
  };
}

interface AgentMessageSuggestionPluginProps {
  sId: string;
  kind: AgentSuggestionKind;
}

/**
 * Creates a React component plugin for rendering agent message suggestions in markdown.
 *
 * This function returns a component that can be used as a custom component
 * in ReactMarkdown to render the agent message suggestion HTML elements.
 */
export function getAgentMessageSuggestionPlugin() {
  const AgentMessageSuggestionPlugin = ({
    sId,
    kind,
  }: AgentMessageSuggestionPluginProps) => {
    const { getBackendSuggestion, isSuggestionsLoading } =
      useCopilotSuggestions();

    if (isSuggestionsLoading || !sId) {
      return <SuggestionCardSkeleton kind={kind} />;
    }

    const suggestionData = getBackendSuggestion(sId);

    if (!suggestionData) {
      return <SuggestionCardError />;
    }

    return <AgentMessageSuggestionCard agentSuggestion={suggestionData} />;
  };

  return AgentMessageSuggestionPlugin;
}
