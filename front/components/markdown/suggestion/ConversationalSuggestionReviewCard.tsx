import type { AgentActionCardSuggestionType } from "@app/components/markdown/suggestion/AgentSuggestionActionCard";
import { getAgentSuggestionLabels } from "@app/components/markdown/suggestion/AgentSuggestionActionCard";
import { ConversationalSuggestionCard } from "@app/components/markdown/suggestion/ConversationalSuggestionCard";
import { PendingSkillSuggestionDetails } from "@app/components/skill_builder/SkillSuggestionCard";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import { Avatar } from "@dust-tt/sparkle";

type ConversationalSuggestionTarget =
  | {
      type: "agent";
      suggestion: AgentActionCardSuggestionType;
      pictureUrl?: string;
    }
  | {
      type: "skill";
      suggestion: SkillSuggestionType;
      getSkillInstructionsHtml: () => string;
      getCurrentAgentFacingDescription: () => string;
      workspaceId: string;
    };

interface ConversationalSuggestionReviewCardProps {
  target: ConversationalSuggestionTarget;
  onAccept: () => void;
  onReject: () => void;
  onPreview?: () => void;
  isAccepting?: boolean;
  isRejecting?: boolean;
}

function renderCardContent(target: ConversationalSuggestionTarget) {
  switch (target.type) {
    case "agent": {
      const labels = getAgentSuggestionLabels(target.suggestion);
      return {
        title: labels.title,
        analysis: labels.description,
        visual: target.pictureUrl ? (
          <Avatar visual={target.pictureUrl} size="sm" />
        ) : undefined,
        collapsibleContent: undefined,
      };
    }
    case "skill":
      return {
        title: target.suggestion.title ?? "Suggestion",
        analysis: target.suggestion.analysis,
        visual: undefined,
        collapsibleContent: (
          <PendingSkillSuggestionDetails
            suggestion={target.suggestion}
            getSkillInstructionsHtml={target.getSkillInstructionsHtml}
            getCurrentAgentFacingDescription={
              target.getCurrentAgentFacingDescription
            }
            workspaceId={target.workspaceId}
          />
        ),
      };
    default:
      assertNeverAndIgnore(target);
      return {
        title: "Suggestion",
        analysis: undefined,
        visual: undefined,
        collapsibleContent: undefined,
      };
  }
}

/**
 * @cc [owner:avervaet,label:product] pending-suggestion-only
 * `target.suggestion` MUST be pending: the card has no reviewed state and would render an
 * accepted, rejected or outdated suggestion as still awaiting review.
 */
export function ConversationalSuggestionReviewCard({
  target,
  onAccept,
  onReject,
  onPreview,
  isAccepting = false,
  isRejecting = false,
}: ConversationalSuggestionReviewCardProps) {
  const { title, analysis, visual, collapsibleContent } =
    renderCardContent(target);

  return (
    <ConversationalSuggestionCard
      title={title}
      analysis={analysis}
      visual={visual}
      collapsibleContent={collapsibleContent}
      onAccept={onAccept}
      onReject={onReject}
      onPreview={onPreview}
      disabled={isAccepting || isRejecting}
      isAccepting={isAccepting}
      isDeclining={isRejecting}
    />
  );
}
