import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { getAgentSuggestionLabels } from "@app/components/markdown/suggestion/AgentSuggestionActionCard";
import { ConversationalSuggestionReviewCard } from "@app/components/markdown/suggestion/ConversationalSuggestionReviewCard";
import type { ConversationAgentSuggestionKind } from "@app/components/markdown/suggestion/suggestion_directives";
import {
  DISABLED_CONVERSATION_AGENT_SUGGESTION_KINDS,
  isConversationAgentSuggestionKind,
} from "@app/components/markdown/suggestion/suggestion_directives";
import { makeSuggestionDirective } from "@app/components/markdown/suggestion/suggestionDirective";
import { ReviewedSuggestionCard } from "@app/components/skill_builder/SkillSuggestionCard";
import { useConversationAgentSuggestionReview } from "@app/hooks/useConversationalSuggestionReview";
import { AGENT_SIDE_PANEL_TYPE } from "@app/types/conversation_side_panel";
import type { AgentSuggestionKind } from "@app/types/suggestions/agent_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import { LoadingBlock } from "@dust-tt/sparkle";

/**
 * Remark directive plugin for parsing agent suggestion directives.
 *
 * Transforms `:agent_suggestion[]{sId=xxx kind=yyy agentId=zzz}` into a custom HTML element
 * that can be rendered by the suggestion card component.
 */
export const agentSuggestionDirective = makeSuggestionDirective(
  "agent_suggestion",
  "agentId"
);

interface ConversationAgentSuggestionProps {
  owner: LightWorkspaceType;
  agentId: string;
  kind: ConversationAgentSuggestionKind;
  suggestionId: string;
  conversationId: string;
}

function ConversationAgentSuggestion({
  owner,
  agentId,
  kind,
  suggestionId,
  conversationId,
}: ConversationAgentSuggestionProps) {
  const { openPanel } = useConversationSidePanelContext();

  const {
    suggestions,
    agentConfiguration,
    isLoading,
    isAgentConfigurationValidating,
    getPendingAction,
    acceptSuggestions,
    rejectSuggestions,
  } = useConversationAgentSuggestionReview({
    workspaceId: owner.sId,
    agentId,
    conversationId,
    skipAgentConfiguration:
      DISABLED_CONVERSATION_AGENT_SUGGESTION_KINDS.includes(kind),
  });

  if (isLoading) {
    return <LoadingBlock className="h-24 w-full" />;
  }

  const suggestion = suggestions.find((s) => s.sId === suggestionId);
  if (!suggestion || suggestion.kind !== kind) {
    return null;
  }

  if (suggestion.state !== "pending") {
    return (
      <ReviewedSuggestionCard
        state={suggestion.state}
        title={getAgentSuggestionLabels(suggestion).title}
        updatedAt={suggestion.updatedAt}
      />
    );
  }

  const pendingAction = getPendingAction(suggestion);

  return (
    <ConversationalSuggestionReviewCard
      target={{
        type: "agent",
        suggestion,
        agentConfiguration,
      }}
      onAccept={() => void acceptSuggestions([suggestion])}
      onReject={() => void rejectSuggestions([suggestion])}
      onPreview={() =>
        openPanel({
          type: AGENT_SIDE_PANEL_TYPE,
          agentId,
          previewSuggestionIds: [suggestion.sId],
        })
      }
      isAccepting={pendingAction === "accept"}
      isRejecting={pendingAction === "reject"}
      // Reviewing against stale agent details would be misleading, so wait for the refresh.
      disabled={isAgentConfigurationValidating}
    />
  );
}

interface ConversationAgentSuggestionPluginProps {
  suggestionId?: string;
  kind?: AgentSuggestionKind;
  agentId?: string;
}

export function getConversationAgentSuggestionPlugin(
  owner: LightWorkspaceType,
  conversationId?: string
) {
  const ConversationAgentSuggestionPlugin = ({
    suggestionId,
    kind,
    agentId,
  }: ConversationAgentSuggestionPluginProps) =>
    suggestionId &&
    kind &&
    isConversationAgentSuggestionKind(kind) &&
    agentId &&
    conversationId ? (
      <ConversationAgentSuggestion
        owner={owner}
        agentId={agentId}
        kind={kind}
        suggestionId={suggestionId}
        conversationId={conversationId}
      />
    ) : null;

  return ConversationAgentSuggestionPlugin;
}
