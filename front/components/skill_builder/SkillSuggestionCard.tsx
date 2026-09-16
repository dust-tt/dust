import { getBlockOuterHtml } from "@app/components/shared/utils";
import { useAuth } from "@app/lib/auth/AuthContext";
import { buildSkillInstructionsExtensions } from "@app/lib/editor/build_skill_instructions_extensions";
import { formatRelativeTime } from "@app/lib/utils/timestamps";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type {
  SkillAgentFacingDescriptionEditType,
  SkillInstructionEditItemType,
  SkillSuggestionState,
  SkillSuggestionType,
} from "@app/types/suggestions/skill_suggestion";
import {
  Button,
  Card,
  CheckCircle,
  Chip,
  Clock,
  DiffBlock,
  Hoverable,
  Tooltip,
  XCircle,
} from "@dust-tt/sparkle";
import { EditorContent, useEditor } from "@tiptap/react";
import type { ComponentType } from "react";
import { useMemo } from "react";

const MAX_VISIBLE_CONVERSATIONS = 3;

function getStatusChip(
  state: SkillSuggestionState,
  { actor, when }: { actor: string | undefined; when: string }
): {
  color: "success" | "warning" | "primary";
  icon: ComponentType;
  label: string;
  tooltip: string;
} | null {
  const by = actor ? ` by ${actor}` : "";

  switch (state) {
    case "pending":
      return null;
    case "approved":
      return {
        color: "success",
        icon: CheckCircle,
        label: "Accepted",
        tooltip: `Accepted${by} ${when}`,
      };
    case "rejected":
      return {
        color: "warning",
        icon: XCircle,
        label: "Declined",
        tooltip: `Declined${by} ${when}`,
      };
    case "outdated":
      return {
        color: "primary",
        icon: Clock,
        label: "Outdated",
        tooltip: `Superseded by a later suggestion`,
      };
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

  const chip = getStatusChip(state, {
    actor: isCurrentUser ? "you" : updatedBy?.fullName,
    when: formatRelativeTime(updatedAt),
  });

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
            label={chip.tooltip}
          />
        )}
        <span className="truncate text-sm text-muted-foreground">
          {title ?? "Suggestion"}
        </span>
      </div>
    </Card>
  );
}

interface AgentFacingDescriptionEditSectionProps {
  edit: SkillAgentFacingDescriptionEditType;
  currentAgentFacingDescription: string;
}

function AgentFacingDescriptionEditSection({
  edit,
  currentAgentFacingDescription,
}: AgentFacingDescriptionEditSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">
        Description change
      </span>
      <DiffBlock>
        <div className="flex flex-col gap-1 p-3 text-sm">
          {currentAgentFacingDescription && (
            <p className="text-muted-foreground line-through">
              {currentAgentFacingDescription}
            </p>
          )}
          <p className="text-foreground">{edit.content}</p>
        </div>
      </DiffBlock>
    </div>
  );
}

interface InstructionEditDiffBlockProps {
  edit: SkillInstructionEditItemType;
  getSkillInstructionsHtml: () => string;
}

function InstructionEditDiffBlock({
  edit,
  getSkillInstructionsHtml,
}: InstructionEditDiffBlockProps) {
  const { targetBlockId, content } = edit;

  const blockHtml = useMemo(() => {
    const instructionsHtml = getSkillInstructionsHtml();
    if (!instructionsHtml) {
      return "";
    }
    return getBlockOuterHtml(instructionsHtml, targetBlockId);
  }, [targetBlockId, getSkillInstructionsHtml]);

  const editor = useEditor(
    {
      extensions: [...buildSkillInstructionsExtensions(true)],
      editable: false,
      content: blockHtml,
      immediatelyRender: false,
      onCreate: ({ editor: e }) => {
        if (!content) {
          return;
        }
        e.commands.applySuggestion({
          id: targetBlockId,
          targetBlockId,
          content,
        });
        e.commands.setHighlightedSuggestion(targetBlockId);
      },
    },
    [blockHtml]
  );

  return <DiffBlock>{editor && <EditorContent editor={editor} />}</DiffBlock>;
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
  const { instructionEdits, agentFacingDescriptionEdit } =
    suggestion.suggestion;
  const isClickable = !!onSelect;
  const hasActions = !!onAccept && !!onDecline;

  if (suggestion.state !== "pending") {
    return <ReviewedSuggestionCard suggestion={suggestion} />;
  }

  return (
    <div
      className={`rounded-xl ${isClickable ? "cursor-pointer transition-shadow" : ""} ${isSelected ? "ring-2 ring-highlight-300" : ""}`}
      onClick={onSelect}
    >
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

        {agentFacingDescriptionEdit && (
          <AgentFacingDescriptionEditSection
            edit={agentFacingDescriptionEdit}
            currentAgentFacingDescription={getCurrentAgentFacingDescription()}
          />
        )}

        {instructionEdits && instructionEdits.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">
              Instruction changes
            </span>
            {instructionEdits.map((edit, index) => (
              <InstructionEditDiffBlock
                key={index}
                edit={edit}
                getSkillInstructionsHtml={getSkillInstructionsHtml}
              />
            ))}
          </div>
        )}

        <ConversationFooter
          visibleSourceConversationIds={suggestion.visibleSourceConversationIds}
          sourceConversationsCount={suggestion.sourceConversationsCount}
          workspaceId={workspaceId}
        />
      </Card>
    </div>
  );
}
