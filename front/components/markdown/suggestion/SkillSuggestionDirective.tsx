/**
 * Markdown directive plugin for conversational skill suggestions.
 *
 * `suggest_skill_*` tools (building_agents_and_skills MCP) records a pending suggestion and emits
 * `:skill_suggestion[]{sId=xxx kind=yyy skillId=zzz}`. The directive carries identifiers only: the
 * card below resolves the suggestion and the skill it targets through their SWR hooks.
 */

import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationalSuggestionReviewCard } from "@app/components/markdown/suggestion/ConversationalSuggestionReviewCard";
import { makeSuggestionDirective } from "@app/components/markdown/suggestion/suggestionDirective";
import {
  getSkillSuggestionTitle,
  ReviewedSuggestionCard,
} from "@app/components/skill_builder/SkillSuggestionCard";
import { useConversationSkillSuggestionReview } from "@app/hooks/useConversationalSuggestionReview";
import { SKILL_SIDE_PANEL_TYPE } from "@app/types/conversation_side_panel";
import type { SkillSuggestionKind } from "@app/types/suggestions/skill_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import { LoadingBlock } from "@dust-tt/sparkle";

/**
 * Remark directive plugin for parsing skill suggestion directives.
 *
 * Transforms `:skill_suggestion[]{sId=xxx kind=yyy skillId=zzz}` into a custom HTML element
 * that can be rendered by the suggestion card component.
 */
export const skillSuggestionDirective = makeSuggestionDirective(
  "skill_suggestion",
  "skillId"
);

interface ConversationSkillSuggestionProps {
  owner: LightWorkspaceType;
  skillId: string;
  kind: SkillSuggestionKind;
  suggestionId: string;
  conversationId: string;
}

function ConversationSkillSuggestion({
  owner,
  skillId,
  kind,
  suggestionId,
  conversationId,
}: ConversationSkillSuggestionProps) {
  const { openPanel } = useConversationSidePanelContext();

  const {
    suggestions,
    skill,
    isLoading,
    getPendingAction,
    acceptSuggestions,
    rejectSuggestions,
  } = useConversationSkillSuggestionReview({
    workspaceId: owner.sId,
    skillId,
    conversationId,
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
        title={getSkillSuggestionTitle(suggestion)}
        updatedAt={suggestion.updatedAt}
        updatedBy={suggestion.updatedBy}
      />
    );
  }

  if (!skill) {
    return null;
  }

  const pendingAction = getPendingAction(suggestion);

  return (
    <ConversationalSuggestionReviewCard
      target={{
        type: "skill",
        suggestion,
        skill,
        workspaceId: owner.sId,
      }}
      onAccept={() => void acceptSuggestions([suggestion])}
      onReject={() => void rejectSuggestions([suggestion])}
      onPreview={() =>
        openPanel({
          type: SKILL_SIDE_PANEL_TYPE,
          skillId,
          previewSuggestionIds: [suggestion.sId],
        })
      }
      isAccepting={pendingAction === "accept"}
      isRejecting={pendingAction === "reject"}
    />
  );
}

interface SkillSuggestionPluginProps {
  suggestionId?: string;
  kind?: SkillSuggestionKind;
  skillId?: string;
}

export function getSkillSuggestionPlugin(
  owner: LightWorkspaceType,
  conversationId?: string
) {
  const SkillSuggestionPlugin = ({
    suggestionId,
    kind,
    skillId,
  }: SkillSuggestionPluginProps) =>
    suggestionId && kind && skillId && conversationId ? (
      <ConversationSkillSuggestion
        owner={owner}
        skillId={skillId}
        kind={kind}
        suggestionId={suggestionId}
        conversationId={conversationId}
      />
    ) : null;

  return SkillSuggestionPlugin;
}
