import { NEW_MANUAL_TASK_MAX_CHARS } from "@app/components/assistant/conversation/space/conversations/project_tasks/utils";
import { removeDiacritics } from "@app/lib/utils";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { SpaceUserType } from "@app/types/user";
import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  User01,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useRef, useState } from "react";

type AddTaskAssigneeChoice =
  | { kind: "default" }
  | { kind: "unassigned" }
  | { kind: "member"; sId: string };

function resolveSubmitAssigneeId(
  choice: AddTaskAssigneeChoice,
  defaultAssigneeId: string
): string | null {
  switch (choice.kind) {
    case "unassigned":
      return null;
    case "default":
      return defaultAssigneeId;
    case "member":
      return choice.sId;
    default:
      assertNeverAndIgnore(choice);
      return null;
  }
}

function memberRowAssigneeChecked(
  choice: AddTaskAssigneeChoice,
  memberId: string,
  defaultAssigneeId: string
): boolean {
  switch (choice.kind) {
    case "unassigned":
      return false;
    case "default":
      return defaultAssigneeId === memberId;
    case "member":
      return choice.sId === memberId;
    default:
      assertNeverAndIgnore(choice);
      return false;
  }
}

interface TaskRowAssigneeMenuProps {
  members: SpaceUserType[];
  viewerUserId: string | null;
  defaultAssigneeId: string;
  choice: AddTaskAssigneeChoice;
  onChoiceChange: (next: AddTaskAssigneeChoice) => void;
  disabled?: boolean;
}

function TaskRowAssigneeMenu({
  members,
  viewerUserId,
  defaultAssigneeId,
  choice,
  onChoiceChange,
  disabled,
}: TaskRowAssigneeMenuProps) {
  const { t } = useLingui();
  const [search, setSearch] = useState("");
  const q = removeDiacritics(search.trim()).toLowerCase();

  const filteredMembers = useMemo(() => {
    if (!q) {
      return [...members];
    }
    return members.filter((m) =>
      removeDiacritics(m.fullName).toLowerCase().includes(q)
    );
  }, [q, members]);

  const noAssigneeLabel = t`No assignee`;
  const noAssigneeLabelNorm = removeDiacritics(noAssigneeLabel).toLowerCase();
  const showNoAssigneeRow =
    members.length !== 1 && (q === "" || noAssigneeLabelNorm.includes(q));

  const effectiveMemberId = resolveSubmitAssigneeId(choice, defaultAssigneeId);
  const selectedUser = effectiveMemberId
    ? members.find((m) => m.sId === effectiveMemberId)
    : null;
  const formatMemberLabel = (member: SpaceUserType) => {
    const memberName = member.fullName;
    return viewerUserId === member.sId ? t`${memberName} (you)` : memberName;
  };

  let tooltip: string;
  if (selectedUser) {
    const assigneeLabel = formatMemberLabel(selectedUser);
    tooltip = t`Assign to ${assigneeLabel}`;
  } else if (choice.kind === "unassigned") {
    tooltip = noAssigneeLabel;
  } else {
    tooltip = t`Choose assignee`;
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) {
          setSearch("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          isRounded
          disabled={disabled}
          tooltip={tooltip}
          icon={
            selectedUser ? (
              <Avatar
                size="xs"
                isRounded
                visual={
                  selectedUser.image ?? "/static/humanavatar/anonymous.png"
                }
              />
            ) : (
              User01
            )
          }
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="start">
        <DropdownMenuSearchbar
          autoFocus
          name="add-task-assignee-search"
          placeholder={t`Search members`}
          value={search}
          onChange={setSearch}
        />
        <DropdownMenuSeparator />
        <div className="max-h-64 overflow-auto">
          {showNoAssigneeRow || filteredMembers.length > 0 ? (
            <>
              {showNoAssigneeRow && (
                <DropdownMenuCheckboxItem
                  key="add-task-no-assignee"
                  label={noAssigneeLabel}
                  checked={choice.kind === "unassigned"}
                  onClick={() => onChoiceChange({ kind: "unassigned" })}
                />
              )}
              {showNoAssigneeRow && filteredMembers.length > 0 && (
                <DropdownMenuSeparator />
              )}
              {filteredMembers.map((member) => (
                <DropdownMenuCheckboxItem
                  key={`add-task-member-${member.sId}`}
                  icon={() => (
                    <Avatar
                      size="xxs"
                      isRounded
                      visual={
                        member.image ?? "/static/humanavatar/anonymous.png"
                      }
                    />
                  )}
                  label={formatMemberLabel(member)}
                  checked={memberRowAssigneeChecked(
                    choice,
                    member.sId,
                    defaultAssigneeId
                  )}
                  onClick={() =>
                    onChoiceChange(
                      member.sId === defaultAssigneeId
                        ? { kind: "default" }
                        : { kind: "member", sId: member.sId }
                    )
                  }
                />
              ))}
            </>
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              <Trans>No members found</Trans>
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface AddTaskComposerProps {
  podMembers: SpaceUserType[];
  viewerUserId: string | null;
  defaultAssigneeId: string;
  /** When true, always assigns to `defaultAssigneeId` with no picker. */
  hideAssigneePicker?: boolean;
  onAdd: (text: string, assigneeId: string | null) => Promise<boolean>;
}

export function AddTaskComposer({
  podMembers,
  viewerUserId,
  defaultAssigneeId,
  hideAssigneePicker = false,
  onAdd,
}: AddTaskComposerProps) {
  const { t } = useLingui();
  const [text, setText] = useState("");
  const [assigneeChoice, setAssigneeChoice] = useState<AddTaskAssigneeChoice>(
    () => ({ kind: "default" })
  );
  const [isAdding, setIsAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (hideAssigneePicker || podMembers.length !== 1) {
      return;
    }
    setAssigneeChoice((c) =>
      c.kind === "unassigned" ? { kind: "default" } : c
    );
  }, [hideAssigneePicker, podMembers.length]);

  const submitAssigneeId = hideAssigneePicker
    ? defaultAssigneeId
    : resolveSubmitAssigneeId(assigneeChoice, defaultAssigneeId);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || isAdding) {
      return;
    }
    setIsAdding(true);
    const ok = await onAdd(trimmed, submitAssigneeId);
    setIsAdding(false);
    if (ok) {
      setText("");
      queueMicrotask(() => inputRef.current?.focus());
    }
  };

  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      {!hideAssigneePicker && (
        <TaskRowAssigneeMenu
          members={podMembers}
          viewerUserId={viewerUserId}
          defaultAssigneeId={defaultAssigneeId}
          choice={assigneeChoice}
          onChoiceChange={setAssigneeChoice}
          disabled={isAdding}
        />
      )}
      <Input
        ref={inputRef}
        name="new-manual-project-task"
        aria-label={t`New task`}
        autoComplete="off"
        maxLength={NEW_MANUAL_TASK_MAX_CHARS}
        placeholder={t`Add a task...`}
        value={text}
        readOnly={isAdding}
        aria-busy={isAdding}
        containerClassName="min-w-0 flex-1"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            inputRef.current?.blur();
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            void handleSubmit();
          }
        }}
      />
      <Button
        size="sm"
        variant="highlight"
        label={t`Add`}
        isLoading={isAdding}
        disabled={isAdding || !text.trim()}
        onClick={() => void handleSubmit()}
      />
    </div>
  );
}
