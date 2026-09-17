/**
 * Markdown directive plugin for sidekick suggestions.
 *
 * This module provides remark-directive plugins for parsing and rendering
 * suggestion directives in markdown content, enabling the :agent_suggestion[]{sId=xxx kind=yyy} syntax.
 */

import { useSidekickSuggestions } from "@app/components/agent_builder/sidekick/SidekickSuggestionsContext";
import {
  mapSuggestionStateToCardState,
  SidekickSuggestionCard,
  SuggestionCardSkeleton,
} from "@app/components/markdown/suggestion/SidekickSuggestionCard";
import { getIcon } from "@app/components/resources/resources_icons";
import { useAgentSuggestions } from "@app/lib/swr/agent_suggestions";
import type { AgentSuggestionKind } from "@app/types/suggestions/agent_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import { ActionCardBlock, Avatar } from "@dust-tt/sparkle";
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
          agentId: node.attributes.agentId,
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

interface ConversationAgentSuggestionProps {
  owner: LightWorkspaceType;
  agentId: string;
  sId: string;
}

/**
 * Renders a `create`-kind suggestion outside the agent builder sidekick, where there is no
 * `SidekickSuggestionsProvider` scoped to the placeholder agent it targets. It fetches the
 * suggestion directly by the placeholder agent's id and, since it's still pending, renders it
 * read-only: reviewing (accept/reject) happens by opening that agent in the builder, where the
 * sidekick resolves the same suggestion against its own `useSidekickSuggestions` context.
 */
function ConversationAgentSuggestion({
  owner,
  agentId,
  sId,
}: ConversationAgentSuggestionProps) {
  const { suggestions, isSuggestionsLoading } = useAgentSuggestions({
    agentConfigurationId: agentId,
    workspaceId: owner.sId,
  });

  if (isSuggestionsLoading) {
    return <SuggestionCardSkeleton kind="create" />;
  }

  const suggestion = suggestions.find((s) => s.sId === sId);
  if (!suggestion || suggestion.kind !== "create") {
    return null;
  }

  const cardState =
    suggestion.state === "pending"
      ? "disabled"
      : mapSuggestionStateToCardState(suggestion.state);

  return (
    <div data-suggestion-s-id={sId}>
      <ActionCardBlock
        title={`Create "${suggestion.suggestion.name}" agent`}
        applyLabel="Accept"
        acceptedTitle={`"${suggestion.suggestion.name}" agent creation accepted`}
        rejectedTitle={`"${suggestion.suggestion.name}" agent creation rejected`}
        visual={<Avatar icon={getIcon("ActionRobotIcon")} size="sm" />}
        description={suggestion.analysis ?? suggestion.suggestion.description}
        state={cardState}
        actionsPosition="header"
      />
    </div>
  );
}

interface ConversationAgentSuggestionPluginProps {
  sId?: string;
  kind?: AgentSuggestionKind;
  agentId?: string;
}

/**
 * Creates the `agent_suggestion` markdown component registered for ordinary conversations (see
 * `AgentMessageMarkdown`). Only `create`-kind suggestions can appear there today, since every
 * other kind is produced within the agent builder sidekick itself.
 */
export function getConversationAgentSuggestionPlugin(
  owner: LightWorkspaceType
) {
  const ConversationAgentSuggestionPlugin = ({
    sId,
    kind,
    agentId,
  }: ConversationAgentSuggestionPluginProps) =>
    sId && kind === "create" && agentId ? (
      <ConversationAgentSuggestion owner={owner} agentId={agentId} sId={sId} />
    ) : null;

  return ConversationAgentSuggestionPlugin;
}
