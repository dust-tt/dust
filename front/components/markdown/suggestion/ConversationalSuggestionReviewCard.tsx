import type { AgentActionCardSuggestionType } from "@app/components/markdown/suggestion/AgentSuggestionActionCard";
import { getAgentSuggestionLabels } from "@app/components/markdown/suggestion/AgentSuggestionActionCard";
import { AgentSuggestionDetails } from "@app/components/markdown/suggestion/AgentSuggestionDetails";
import { ConversationalSuggestionCard } from "@app/components/markdown/suggestion/ConversationalSuggestionCard";
import { PendingSkillSuggestionDetails } from "@app/components/skill_builder/SkillSuggestionCard";
import { getSkillAvatarIcon } from "@app/lib/skill";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import { Avatar } from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useMemo } from "react";

type ConversationalSuggestionTarget =
  | {
      type: "agent";
      suggestion: AgentActionCardSuggestionType;
      agentConfiguration: AgentConfigurationType | null;
    }
  | {
      type: "skill";
      suggestion: SkillSuggestionType;
      skill: SkillType;
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
  titleAside?: ReactNode;
  secondaryAction?: ReactNode;
}

interface SkillAvatarVisualProps {
  skill: SkillType;
}

function SkillAvatarVisual({ skill }: SkillAvatarVisualProps) {
  const SkillAvatar = useMemo(() => getSkillAvatarIcon(skill), [skill]);
  return <SkillAvatar size="sm" />;
}

function renderCardContent(target: ConversationalSuggestionTarget) {
  switch (target.type) {
    case "agent": {
      const labels = getAgentSuggestionLabels(target.suggestion);
      return {
        title: labels.title,
        analysis: labels.description,
        visual: target.agentConfiguration ? (
          <Avatar visual={target.agentConfiguration.pictureUrl} size="sm" />
        ) : undefined,
        collapsibleContent: (
          <AgentSuggestionDetails
            suggestion={target.suggestion}
            agentConfiguration={target.agentConfiguration}
          />
        ),
      };
    }
    case "skill":
      return {
        title: target.suggestion.title ?? "Suggestion",
        analysis: target.suggestion.analysis,
        visual: <SkillAvatarVisual skill={target.skill} />,
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
 * @cc [owner:avervaet,label:product] conversational-and-pending
 * Returns true if and only if `suggestion.source` is `conversational` and `suggestion.state` is
 * `pending`.
 */
export function shouldUseConversationalReviewCard(
  suggestion: Pick<
    AgentActionCardSuggestionType | SkillSuggestionType,
    "source" | "state"
  >
): boolean {
  return (
    suggestion.source === "conversational" && suggestion.state === "pending"
  );
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
  titleAside,
  secondaryAction,
}: ConversationalSuggestionReviewCardProps) {
  const { title, analysis, visual, collapsibleContent } =
    renderCardContent(target);

  return (
    <ConversationalSuggestionCard
      title={title}
      titleAside={titleAside}
      analysis={analysis}
      visual={visual}
      collapsibleContent={collapsibleContent}
      onAccept={onAccept}
      onReject={onReject}
      onPreview={onPreview}
      disabled={isAccepting || isRejecting}
      isAccepting={isAccepting}
      isDeclining={isRejecting}
      secondaryAction={secondaryAction}
    />
  );
}
