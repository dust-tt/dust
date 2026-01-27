/**
 * Markdown directive plugin for suggestions.
 *
 * This module provides remark-directive plugins for parsing and rendering
 * suggestion directives in markdown content, enabling the :agentMessageSuggestion[]{sId=xxx} syntax.
 */

import React from "react";
import { visit } from "unist-util-visit";

import { AgentMessageSuggestionCard } from "@app/components/markdown/suggestion/AgentMessageSuggestionCard";
import { useAgentMessageSuggestions } from "@app/components/markdown/suggestion/AgentMessageSuggestionsContext";

/**
 * Remark directive plugin for parsing agent message suggestion directives.
 *
 * Transforms `:agentMessageSuggestion[]{sId=xxx}` into a custom HTML element
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
        };
      }
    });
  };
}

interface AgentMessageSuggestionPluginProps {
  sId: string;
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
  }: AgentMessageSuggestionPluginProps) => {
    const { getSuggestion } = useAgentMessageSuggestions();
    const suggestionData = getSuggestion(sId);

    if (!suggestionData) {
      return null;
    }

    return <AgentMessageSuggestionCard agentSuggestion={suggestionData} />;
  };

  return AgentMessageSuggestionPlugin;
}
