import { getSuggestionStateChip } from "@app/components/shared/getSuggestionStateChip";
import { SuggestedEditors } from "@app/components/shared/SuggestedEditors";
import type { SuggestionDiffLayout } from "@app/components/shared/SuggestionFieldEditSection";
import { SuggestionFieldEditSection } from "@app/components/shared/SuggestionFieldEditSection";
import { SuggestionInstructionsDiffBlock } from "@app/components/shared/SuggestionInstructionsDiffBlock";
import { SuggestionNewInstructionsBlock } from "@app/components/shared/SuggestionNewInstructionsBlock";
import { SuggestedSkillAvailability } from "@app/components/skill_builder/SuggestedSkillAvailability";
import { SuggestedSkillFiles } from "@app/components/skill_builder/SuggestedSkillFiles";
import { SuggestedSkillName } from "@app/components/skill_builder/SuggestedSkillName";
import { SuggestedSkillUserFacingDescription } from "@app/components/skill_builder/SuggestedSkillUserFacingDescription";
import { useAuth } from "@app/lib/auth/AuthContext";
import { formatRelativeTime } from "@app/lib/client/relative_time";
import { buildSkillInstructionsExtensions } from "@app/lib/editor/build_skill_instructions_extensions";
import { useSkill } from "@app/lib/swr/skill_configurations";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type {
  SkillSuggestionState,
  SkillSuggestionType,
} from "@app/types/suggestions/skill_suggestion";
import {
  Button,
  Card,
  Chip,
  Hoverable,
  LoadingBlock,
  Tooltip,
} from "@dust-tt/sparkle";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import type { KeyboardEvent } from "react";

const MAX_VISIBLE_CONVERSATIONS = 3;

interface ReviewedSuggestionCardProps {
  state: SkillSuggestionState;
  title: string;
  updatedAt: number;
  /** Named in the tooltip when known. */
  updatedBy?: { sId: string; fullName: string } | null;
}

export function ReviewedSuggestionCard({
  state,
  title,
  updatedAt,
  updatedBy,
}: ReviewedSuggestionCardProps) {
  const { t } = useLingui();
  const { user } = useAuth();

  const isCurrentUser = !!updatedBy && updatedBy.sId === user?.sId;

  const chip = getSuggestionStateChip(state);
  const reviewerName = updatedBy?.fullName;
  const relativeTime = formatRelativeTime(updatedAt);

  const getStateTexts = (): { label: string; tooltip: string } | null => {
    switch (state) {
      case "pending":
        return null;
      case "approved":
        return {
          label: t({ message: "Accepted", context: "suggestion state" }),
          tooltip: isCurrentUser
            ? t`Accepted by you ${relativeTime}`
            : reviewerName
              ? t`Accepted by ${reviewerName} ${relativeTime}`
              : t`Accepted ${relativeTime}`,
        };
      case "rejected":
        return {
          label: t({ message: "Declined", context: "suggestion state" }),
          tooltip: isCurrentUser
            ? t`Declined by you ${relativeTime}`
            : reviewerName
              ? t`Declined by ${reviewerName} ${relativeTime}`
              : t`Declined ${relativeTime}`,
        };
      case "outdated":
        return {
          label: t({ message: "Outdated", context: "suggestion state" }),
          tooltip: t`Superseded by a later suggestion`,
        };
      default:
        assertNeverAndIgnore(state);
        return null;
    }
  };
  const stateTexts = getStateTexts();

  return (
    <Card variant="primary" size="sm" className="flex-col gap-1">
      <div className="flex min-w-0 items-center gap-2">
        {chip && stateTexts && (
          <Tooltip
            trigger={
              <Chip
                size="xs"
                color={chip.color}
                icon={chip.icon}
                label={stateTexts.label}
              />
            }
            label={stateTexts.tooltip}
          />
        )}
        <span className="truncate text-sm text-muted-foreground">{title}</span>
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
        <Plural
          value={sourceConversationsCount}
          one="Based on # conversation"
          other="Based on # conversations"
        />
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

  const joinLinks = (linksToJoin: typeof indexedLinks) =>
    linksToJoin.map((link, i) => (
      <span key={link.key}>
        {i > 0 && ", "}
        {link}
      </span>
    ));

  if (remainingCount > 0) {
    const links = joinLinks(indexedLinks);
    return (
      <p className="text-xs text-muted-foreground">
        <Plural
          value={remainingCount}
          one={<Trans>Based on conversations {links} and # other</Trans>}
          other={<Trans>Based on conversations {links} and # others</Trans>}
        />
      </p>
    );
  }

  const links = joinLinks(indexedLinks.slice(0, -1));
  const lastLink = indexedLinks[indexedLinks.length - 1];

  return (
    <p className="text-xs text-muted-foreground">
      {links.length === 0 ? (
        <Trans>Based on conversation {lastLink}</Trans>
      ) : (
        <Trans>
          Based on conversations {links} and {lastLink}
        </Trans>
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

  const skillName = skill?.name;

  return (
    <p className="text-sm text-foreground">
      <Trans>
        Delete the <span className="font-medium">{skillName}</span> skill.
      </Trans>
    </p>
  );
}

interface SuggestionDetailsProps {
  suggestion: SkillSuggestionType;
  getSkillInstructionsHtml: () => string;
  getCurrentAgentFacingDescription: () => string;
  workspaceId: string;
  layout: SuggestionDiffLayout;
}

function SuggestionDetails({
  suggestion,
  getSkillInstructionsHtml,
  getCurrentAgentFacingDescription,
  workspaceId,
  layout,
}: SuggestionDetailsProps) {
  const { t } = useLingui();

  switch (suggestion.kind) {
    case "availability":
      return (
        <SuggestedSkillAvailability
          suggestion={suggestion.suggestion}
          skillId={suggestion.skillConfigurationId}
          workspaceId={workspaceId}
        />
      );

    case "create": {
      const {
        name,
        userFacingDescription,
        agentFacingDescription,
        instructions,
      } = suggestion.suggestion;
      return (
        <div className="flex flex-col gap-3">
          <SuggestionFieldEditSection
            label={t`Name`}
            currentValue=""
            newValue={name}
            layout={layout}
          />
          <SuggestionFieldEditSection
            label={t`Description`}
            currentValue=""
            newValue={userFacingDescription}
            layout={layout}
          />
          <SuggestionFieldEditSection
            label={t`When to use this skill`}
            currentValue=""
            newValue={agentFacingDescription}
            layout={layout}
          />
          <SuggestionNewInstructionsBlock
            instructionsHtml={instructions}
            extensions={buildSkillInstructionsExtensions(true)}
            layout={layout}
          />
        </div>
      );
    }

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
            <SuggestionFieldEditSection
              label={t`When to use this skill`}
              currentValue={getCurrentAgentFacingDescription()}
              newValue={agentFacingDescriptionEdit.content}
              layout={layout}
            />
          )}

          {instructionEdits && instructionEdits.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">
                <Trans>Instructions</Trans>
              </span>
              {instructionEdits.map((edit, index) => (
                <SuggestionInstructionsDiffBlock
                  key={index}
                  instructionsHtml={getSkillInstructionsHtml()}
                  targetBlockId={edit.targetBlockId}
                  content={edit.content}
                  extensions={buildSkillInstructionsExtensions(true, [], {
                    hideUnchangedSuggestionBlocks: layout === "inline",
                  })}
                  layout={layout}
                />
              ))}
            </div>
          )}
        </>
      );
    }

    case "editors":
      return (
        <SuggestedEditors
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
          layout={layout}
        />
      );

    case "files":
      return (
        <SuggestedSkillFiles
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
          layout={layout}
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
  layout?: SuggestionDiffLayout;
}

export function PendingSkillSuggestionDetails({
  suggestion,
  getSkillInstructionsHtml,
  getCurrentAgentFacingDescription,
  workspaceId,
  layout = "boxed",
}: PendingSkillSuggestionDetailsProps) {
  return (
    <>
      <SuggestionDetails
        suggestion={suggestion}
        getSkillInstructionsHtml={getSkillInstructionsHtml}
        getCurrentAgentFacingDescription={getCurrentAgentFacingDescription}
        workspaceId={workspaceId}
        layout={layout}
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
  const { t } = useLingui();
  const isClickable = !!onSelect;
  const hasActions = !!onAccept && !!onDecline;

  if (suggestion.state !== "pending") {
    return (
      <ReviewedSuggestionCard
        state={suggestion.state}
        title={suggestion.title ?? t`Suggestion`}
        updatedAt={suggestion.updatedAt}
        updatedBy={suggestion.updatedBy}
      />
    );
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
            {suggestion.title ?? t`Suggestion`}
          </span>
          {hasActions && (
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="outline"
                size="sm"
                label={t`Decline`}
                onClick={() => onDecline(suggestion)}
                disabled={disabled}
                isLoading={isDeclining}
              />
              <Button
                variant="highlight"
                size="sm"
                label={t`Accept`}
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
