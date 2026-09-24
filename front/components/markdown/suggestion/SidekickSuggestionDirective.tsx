/**
 * Markdown directive plugin for agent suggestions.
 *
 * This module provides remark-directive plugins for parsing and rendering
 * suggestion directives in markdown content, enabling the
 * :agent_suggestion[]{sId=xxx kind=yyy agentId=zzz} syntax.
 */

import { useSidekickSuggestions } from "@app/components/agent_builder/sidekick/SidekickSuggestionsContext";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { AgentSuggestionActionCard } from "@app/components/markdown/suggestion/AgentSuggestionActionCard";
import {
  ConversationalSuggestionReviewCard,
  shouldUseConversationalReviewCard,
} from "@app/components/markdown/suggestion/ConversationalSuggestionReviewCard";
import {
  SidekickSuggestionCard,
  SuggestionCardSkeleton,
} from "@app/components/markdown/suggestion/SidekickSuggestionCard";
import {
  useAgentSuggestionActions,
  useAgentSuggestions,
} from "@app/lib/swr/agent_suggestions";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { AGENT_SIDE_PANEL_TYPE } from "@app/types/conversation_side_panel";
import type { AgentSuggestionKind } from "@app/types/suggestions/agent_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import { LoadingBlock } from "@dust-tt/sparkle";
import { useEffect } from "react";
import { SKIP, visit } from "unist-util-visit";

function toSuggestionProperties(attributes: Record<string, string>) {
  return {
    suggestionId: attributes.sId,
    kind: attributes.kind,
    agentId: attributes.agentId,
  };
}

/**
 * Remark directive plugin for parsing agent suggestion directives.
 *
 * Transforms `:agent_suggestion[]{sId=xxx kind=yyy agentId=zzz}` into a custom HTML element
 * that can be rendered by the suggestion card component.
 */
export function sidekickSuggestionDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective", "leafDirective"], (node) => {
      if (node.name === "agent_suggestion") {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const data = node.data || (node.data = {});
        data.hName = "agent_suggestion";
        data.hProperties = toSuggestionProperties(node.attributes);
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
          data: {
            hName: "agent_suggestion",
            hProperties: toSuggestionProperties(attrs),
          },
        },
        ...parent.children.slice(index + 1),
      ];

      return [SKIP, index];
    });
  };
}

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

const CONVERSATION_AGENT_SUGGESTION_KINDS = [
  "create",
  "delete",
  "description",
  "instructions",
  "model",
  "name",
  "scope",
] as const;

type ConversationAgentSuggestionKind =
  (typeof CONVERSATION_AGENT_SUGGESTION_KINDS)[number];

// `create` targets a not-yet-created placeholder agent, so there is no configuration to fetch.
const DISABLED_CONVERSATION_AGENT_SUGGESTION_KINDS: ConversationAgentSuggestionKind[] =
  ["create"];

function isConversationAgentSuggestionKind(
  kind: AgentSuggestionKind
): kind is ConversationAgentSuggestionKind {
  return CONVERSATION_AGENT_SUGGESTION_KINDS.includes(
    kind as ConversationAgentSuggestionKind
  );
}

interface ConversationAgentSuggestionProps {
  owner: LightWorkspaceType;
  agentId: string;
  kind: ConversationAgentSuggestionKind;
  suggestionId: string;
}

function ConversationAgentSuggestion({
  owner,
  agentId,
  kind,
  suggestionId,
}: ConversationAgentSuggestionProps) {
  const { openPanel } = useConversationSidePanelContext();

  const { suggestions, isSuggestionsLoading, mutateSuggestions } =
    useAgentSuggestions({
      agentConfigurationId: agentId,
      workspaceId: owner.sId,
    });

  const { getPendingAction, acceptSuggestion, rejectSuggestion } =
    useAgentSuggestionActions({
      agentConfigurationId: agentId,
      workspaceId: owner.sId,
      mutateSuggestions,
    });

  const { agentConfiguration } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: agentId,
    disabled: DISABLED_CONVERSATION_AGENT_SUGGESTION_KINDS.includes(kind),
  });

  if (isSuggestionsLoading) {
    return <LoadingBlock className="h-24 w-full" />;
  }

  const suggestion = suggestions.find((s) => s.sId === suggestionId);
  if (!suggestion || suggestion.kind !== kind) {
    return null;
  }

  const pendingAction = getPendingAction(suggestion);

  if (shouldUseConversationalReviewCard(suggestion)) {
    return (
      <ConversationalSuggestionReviewCard
        target={{
          type: "agent",
          suggestion,
          pictureUrl: agentConfiguration?.pictureUrl,
        }}
        onAccept={() => void acceptSuggestion(suggestion)}
        onReject={() => void rejectSuggestion(suggestion)}
        onPreview={() =>
          openPanel({
            type: AGENT_SIDE_PANEL_TYPE,
            agentId,
            previewSuggestionIds: [suggestion.sId],
          })
        }
        isAccepting={pendingAction === "accept"}
        isRejecting={pendingAction === "reject"}
      />
    );
  }

  return (
    <AgentSuggestionActionCard
      agentSuggestion={suggestion}
      pictureUrl={agentConfiguration?.pictureUrl}
      disabled={pendingAction !== null}
      onAccept={() => void acceptSuggestion(suggestion)}
      onReject={() => void rejectSuggestion(suggestion)}
    />
  );
}

interface ConversationAgentSuggestionPluginProps {
  suggestionId?: string;
  kind?: AgentSuggestionKind;
  agentId?: string;
}

export function getConversationAgentSuggestionPlugin(
  owner: LightWorkspaceType
) {
  const ConversationAgentSuggestionPlugin = ({
    suggestionId,
    kind,
    agentId,
  }: ConversationAgentSuggestionPluginProps) =>
    suggestionId &&
    kind &&
    isConversationAgentSuggestionKind(kind) &&
    agentId ? (
      <ConversationAgentSuggestion
        owner={owner}
        agentId={agentId}
        kind={kind}
        suggestionId={suggestionId}
      />
    ) : null;

  return ConversationAgentSuggestionPlugin;
}
