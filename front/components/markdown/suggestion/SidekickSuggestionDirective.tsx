/**
 * Markdown directive plugin for agent suggestions.
 *
 * This module provides remark-directive plugins for parsing and rendering
 * suggestion directives in markdown content, enabling the
 * :agent_suggestion[]{sId=xxx kind=yyy agentId=zzz} syntax.
 */

import { useSidekickSuggestions } from "@app/components/agent_builder/sidekick/SidekickSuggestionsContext";
import {
  mapSuggestionStateToCardState,
  SidekickSuggestionCard,
  SuggestionCardSkeleton,
} from "@app/components/markdown/suggestion/SidekickSuggestionCard";
import { getIcon } from "@app/components/resources/resources_icons";
import {
  useAgentSuggestions,
  usePatchAgentSuggestions,
} from "@app/lib/swr/agent_suggestions";
import type { PatchSuggestionResponseBody } from "@app/types/api/assistant/agent_suggestion";
import type { AgentSuggestionKind } from "@app/types/suggestions/agent_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import { ActionCardBlock, Avatar } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";
import { SKIP, visit } from "unist-util-visit";

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

const CONVERSATION_AGENT_SUGGESTION_KINDS = ["create", "delete"] as const;

type ConversationAgentSuggestionKind =
  (typeof CONVERSATION_AGENT_SUGGESTION_KINDS)[number];

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
  sId: string;
}

function ConversationAgentSuggestion({
  owner,
  agentId,
  kind,
  sId,
}: ConversationAgentSuggestionProps) {
  const [pendingAction, setPendingAction] = useState<
    "accept" | "decline" | null
  >(null);

  const { suggestions, isSuggestionsLoading, mutateSuggestions } =
    useAgentSuggestions({
      agentConfigurationId: agentId,
      workspaceId: owner.sId,
    });

  const { patchSuggestions } = usePatchAgentSuggestions({
    agentConfigurationId: agentId,
    workspaceId: owner.sId,
  });

  const updateCachedSuggestions = (
    patched: PatchSuggestionResponseBody | null
  ) => {
    const reviewed = patched?.suggestions ?? [];
    if (reviewed.length === 0) {
      return;
    }
    const reviewedById = new Map(reviewed.map((s) => [s.sId, s]));
    void mutateSuggestions(
      (current) => ({
        suggestions: (current?.suggestions ?? []).map(
          (s) => reviewedById.get(s.sId) ?? s
        ),
      }),
      { revalidate: false }
    );
  };

  const handleAccept = async () => {
    if (pendingAction) {
      return;
    }
    setPendingAction("accept");
    try {
      updateCachedSuggestions(
        await patchSuggestions([sId], "approved", { applyToAgent: true })
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleDecline = async () => {
    if (pendingAction) {
      return;
    }
    setPendingAction("decline");
    try {
      updateCachedSuggestions(await patchSuggestions([sId], "rejected"));
    } finally {
      setPendingAction(null);
    }
  };

  if (isSuggestionsLoading) {
    return <SuggestionCardSkeleton kind={kind} />;
  }

  const suggestion = suggestions.find((s) => s.sId === sId);
  if (!suggestion || suggestion.kind !== kind) {
    return null;
  }

  const cardState =
    pendingAction !== null
      ? "disabled"
      : mapSuggestionStateToCardState(suggestion.state);

  const name = suggestion.suggestion.name;
  const labels =
    suggestion.kind === "create"
      ? {
          title: `Create "${name}" agent`,
          acceptedTitle: `"${name}" agent creation accepted`,
          rejectedTitle: `"${name}" agent creation rejected`,
          description: suggestion.analysis ?? suggestion.suggestion.description,
        }
      : {
          title: `Delete "${name}" agent`,
          acceptedTitle: `"${name}" agent deletion accepted`,
          rejectedTitle: `"${name}" agent deletion rejected`,
          description: suggestion.analysis ?? undefined,
        };

  return (
    <div data-suggestion-s-id={sId}>
      <ActionCardBlock
        title={labels.title}
        applyLabel="Accept"
        acceptedTitle={labels.acceptedTitle}
        rejectedTitle={labels.rejectedTitle}
        visual={<Avatar icon={getIcon("ActionRobotIcon")} size="sm" />}
        description={labels.description}
        state={cardState}
        actionsPosition="header"
        onClickAccept={() => void handleAccept()}
        onClickReject={() => void handleDecline()}
      />
    </div>
  );
}

interface ConversationAgentSuggestionPluginProps {
  sId?: string;
  kind?: AgentSuggestionKind;
  agentId?: string;
}

export function getConversationAgentSuggestionPlugin(
  owner: LightWorkspaceType
) {
  const ConversationAgentSuggestionPlugin = ({
    sId,
    kind,
    agentId,
  }: ConversationAgentSuggestionPluginProps) =>
    sId && kind && isConversationAgentSuggestionKind(kind) && agentId ? (
      <ConversationAgentSuggestion
        owner={owner}
        agentId={agentId}
        kind={kind}
        sId={sId}
      />
    ) : null;

  return ConversationAgentSuggestionPlugin;
}
