import { SuggestionInstructionsDiffBlock } from "@app/components/shared/SuggestionInstructionsDiffBlock";
import { SkillFieldEditSection } from "@app/components/skill_builder/SkillFieldEditSection";
import { SuggestedSkillAvailability } from "@app/components/skill_builder/SuggestedSkillAvailability";
import { SuggestedSkillEditors } from "@app/components/skill_builder/SuggestedSkillEditors";
import { SuggestedSkillName } from "@app/components/skill_builder/SuggestedSkillName";
import { SuggestedSkillUserFacingDescription } from "@app/components/skill_builder/SuggestedSkillUserFacingDescription";
import { useAuth } from "@app/lib/auth/AuthContext";
import { buildSkillInstructionsExtensions } from "@app/lib/editor/build_skill_instructions_extensions";
import { useSkill } from "@app/lib/swr/skill_configurations";
import { formatRelativeTime } from "@app/lib/utils/timestamps";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type {
  SkillSuggestionState,
  SkillSuggestionType,
} from "@app/types/suggestions/skill_suggestion";
import {
  Button,
  Card,
  CheckCircle,
  Chip,
  Clock,
  Hoverable,
  LoadingBlock,
  Tooltip,
  XCircle,
} from "@dust-tt/sparkle";
import type { ComponentType, KeyboardEvent } from "react";

const MAX_VISIBLE_CONVERSATIONS = 3;

export function getSuggestionStateChip(state: SkillSuggestionState): {
  color: "success" | "warning" | "primary";
  icon: ComponentType;
  label: string;
} | null {
  switch (state) {
    case "pending":
      return null;
    case "approved":
      return { color: "success", icon: CheckCircle, label: "Accepted" };
    case "rejected":
      return { color: "warning", icon: XCircle, label: "Declined" };
    case "outdated":
      return { color: "primary", icon: Clock, label: "Outdated" };
    default:
      assertNeverAndIgnore(state);
      return null;
  }
}

interface ReviewedSuggestionCardProps {
  suggestion: SkillSuggestionType;
}

function ReviewedSuggestionCard({ suggestion }: ReviewedSuggestionCardProps) {
  const { state, title, updatedAt, updatedBy } = suggestion;
  const { user } = useAuth();

  const isCurrentUser = !!updatedBy && updatedBy.sId === user?.sId;

  const chip = getSuggestionStateChip(state);
  const actor = isCurrentUser ? "you" : updatedBy?.fullName;
  const by = actor ? ` by ${actor}` : "";

  return (
    <Card variant="primary" size="sm" className="flex-col gap-1">
      <div className="flex min-w-0 items-center gap-2">
        {chip && (
          <Tooltip
            trigger={
              <Chip
                size="xs"
                color={chip.color}
                icon={chip.icon}
                label={chip.label}
              />
            }
            label={
              state === "outdated"
                ? "Superseded by a later suggestion"
                : `${chip.label}${by} ${formatRelativeTime(updatedAt)}`
            }
          />
        )}
        <span className="truncate text-sm text-muted-foreground">
          {title ?? "Suggestion"}
        </span>
      </div>
    </Card>
  );
}

interface ConversationFooterProps {
  visibleSourceConversationIds: string[];
  sourceConversationsCount: number;
  workspaceId: string;
}

function ConversationFooter({
  visibleSourceConversationIds,
  sourceConversationsCount,
  workspaceId,
}: ConversationFooterProps) {
  if (sourceConversationsCount === 0) {
    return null;
  }

  const shownIds = visibleSourceConversationIds.slice(
    0,
    MAX_VISIBLE_CONVERSATIONS
  );
  const remainingCount = sourceConversationsCount - shownIds.length;

  if (shownIds.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Based on {sourceConversationsCount} conversation
        {sourceConversationsCount > 1 ? "s" : ""}
      </p>
    );
  }

  const indexedLinks = shownIds.map((id, i) => (
    <Hoverable
      key={id}
      variant="primary"
      href={`/w/${workspaceId}/conversation/${id}`}
      target="_blank"
      onClick={(e) => e.stopPropagation()}
    >
      {i + 1}
    </Hoverable>
  ));

  return (
    <p className="text-xs text-muted-foreground">
      Based on conversation
      {shownIds.length > 1 || remainingCount > 0 ? "s" : ""}{" "}
      {indexedLinks.map((link, i) => (
        <span key={shownIds[i]}>
          {i > 0 &&
            (remainingCount === 0 && i === indexedLinks.length - 1
              ? " and "
              : ", ")}
          {link}
        </span>
      ))}
      {remainingCount > 0 && (
        <>
          {" "}
          and {remainingCount} other
          {remainingCount > 1 ? "s" : ""}
        </>
      )}
    </p>
  );
}

interface DeleteSuggestionSectionProps {
  skillId: string;
  workspaceId: string;
}

function DeleteSuggestionSection({
  skillId,
  workspaceId,
}: DeleteSuggestionSectionProps) {
  const { skill, isSkillLoading } = useSkill({ workspaceId, skillId });

  if (isSkillLoading) {
    return <LoadingBlock className="h-6 w-full" />;
  }

  return (
    <p className="text-sm text-foreground">
      Delete the <span className="font-medium">{skill?.name}</span> skill.
    </p>
  );
}

interface SuggestionDetailsProps {
  suggestion: SkillSuggestionType;
  getSkillInstructionsHtml: () => string;
  getCurrentAgentFacingDescription: () => string;
  workspaceId: string;
}

function SuggestionDetails({
  suggestion,
  getSkillInstructionsHtml,
  getCurrentAgentFacingDescription,
  workspaceId,
}: SuggestionDetailsProps) {
  switch (suggestion.kind) {
    case "availability":
      return (
        <SuggestedSkillAvailability
          suggestion={suggestion.suggestion}
          skillId={suggestion.skillConfigurationId}
          workspaceId={workspaceId}
        />
      );

    case "create":
      return null;

    case "delete":
      return (
        <DeleteSuggestionSection
          skillId={suggestion.skillConfigurationId}
          workspaceId={workspaceId}
        />
      );

    case "edit": {
      const { instructionEdits, agentFacingDescriptionEdit } =
        suggestion.suggestion;

      return (
        <>
          {agentFacingDescriptionEdit && (
            <SkillFieldEditSection
              label="Description"
              currentValue={getCurrentAgentFacingDescription()}
              newValue={agentFacingDescriptionEdit.content}
            />
          )}

          {instructionEdits && instructionEdits.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">
                Instructions
              </span>
              {instructionEdits.map((edit, index) => (
                <SuggestionInstructionsDiffBlock
                  key={index}
                  instructionsHtml={getSkillInstructionsHtml()}
                  targetBlockId={edit.targetBlockId}
                  content={edit.content}
                  extensions={buildSkillInstructionsExtensions(true)}
                />
              ))}
            </div>
          )}
        </>
      );
    }

    case "editors":
      return (
        <SuggestedSkillEditors
          suggestion={suggestion.suggestion}
          workspaceId={workspaceId}
        />
      );

    case "name":
      return (
        <SuggestedSkillName
          suggestion={suggestion.suggestion}
          skillId={suggestion.skillConfigurationId}
          workspaceId={workspaceId}
        />
      );

    case "user_facing_description":
      return (
        <SuggestedSkillUserFacingDescription
          suggestion={suggestion.suggestion}
          skillId={suggestion.skillConfigurationId}
          workspaceId={workspaceId}
        />
      );

    default:
      assertNeverAndIgnore(suggestion);
      return null;
  }
}

interface PendingSkillSuggestionDetailsProps {
  suggestion: SkillSuggestionType;
  getSkillInstructionsHtml: () => string;
  getCurrentAgentFacingDescription: () => string;
  workspaceId: string;
}

export function PendingSkillSuggestionDetails({
  suggestion,
  getSkillInstructionsHtml,
  getCurrentAgentFacingDescription,
  workspaceId,
}: PendingSkillSuggestionDetailsProps) {
  return (
    <>
      <SuggestionDetails
        suggestion={suggestion}
        getSkillInstructionsHtml={getSkillInstructionsHtml}
        getCurrentAgentFacingDescription={getCurrentAgentFacingDescription}
        workspaceId={workspaceId}
      />

      {suggestion.source !== "conversational" && (
        <ConversationFooter
          visibleSourceConversationIds={suggestion.visibleSourceConversationIds}
          sourceConversationsCount={suggestion.sourceConversationsCount}
          workspaceId={workspaceId}
        />
      )}
    </>
  );
}

interface SkillSuggestionCardProps {
  suggestion: SkillSuggestionType;
  onAccept?: (suggestion: SkillSuggestionType) => void;
  onDecline?: (suggestion: SkillSuggestionType) => void;
  getSkillInstructionsHtml: () => string;
  getCurrentAgentFacingDescription: () => string;
  isSelected?: boolean;
  onSelect?: () => void;
  workspaceId: string;
  disabled?: boolean;
  isAccepting?: boolean;
  isDeclining?: boolean;
}

export function SkillSuggestionCard({
  suggestion,
  onAccept,
  onDecline,
  getSkillInstructionsHtml,
  getCurrentAgentFacingDescription,
  isSelected = false,
  onSelect,
  workspaceId,
  disabled = false,
  isAccepting = false,
  isDeclining = false,
}: SkillSuggestionCardProps) {
  const isClickable = !!onSelect;
  const hasActions = !!onAccept && !!onDecline;

  if (suggestion.state !== "pending") {
    return <ReviewedSuggestionCard suggestion={suggestion} />;
  }

  const wrapperClassName = `rounded-xl ${isClickable ? "cursor-pointer transition-shadow" : ""} ${isSelected ? "ring-2 ring-highlight-300" : ""}`;

  const wrapperProps = onSelect
    ? {
        role: "button",
        tabIndex: 0,
        onClick: onSelect,
        onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        },
      }
    : {};

  return (
    <div className={wrapperClassName} {...wrapperProps}>
      <Card variant="primary" size="md" className="flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="heading-base text-foreground">
            {suggestion.title ?? "Suggestion"}
          </span>
          {hasActions && (
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="outline"
                size="sm"
                label="Decline"
                onClick={() => onDecline(suggestion)}
                disabled={disabled}
                isLoading={isDeclining}
              />
              <Button
                variant="highlight"
                size="sm"
                label="Accept"
                onClick={() => onAccept(suggestion)}
                disabled={disabled}
                isLoading={isAccepting}
              />
            </div>
          )}
        </div>

        {suggestion.analysis && (
          <p className="text-sm text-muted-foreground">{suggestion.analysis}</p>
        )}

        <PendingSkillSuggestionDetails
          suggestion={suggestion}
          getSkillInstructionsHtml={getSkillInstructionsHtml}
          getCurrentAgentFacingDescription={getCurrentAgentFacingDescription}
          workspaceId={workspaceId}
        />
      </Card>
    </div>
  );
}
