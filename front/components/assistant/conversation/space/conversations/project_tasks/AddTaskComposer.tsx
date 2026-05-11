import {
  MANUAL_ADD_TASK_PLACEHOLDER,
  NEW_MANUAL_TASK_MAX_CHARS,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/utils";
import { removeDiacritics } from "@app/lib/utils";
import { PROJECT_TASK_NO_ASSIGNEE_LABEL } from "@app/types/project_task";
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
  UserIcon,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef, useState } from "react";

export type AddTaskAssigneeChoice =
  | { kind: "default" }
  | { kind: "unassigned" }
  | { kind: "member"; sId: string };

export function resolveSubmitAssigneeSId(
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
  memberSId: string,
  defaultAssigneeId: string
): boolean {
  switch (choice.kind) {
    case "unassigned":
      return false;
    case "default":
      return defaultAssigneeId === memberSId;
    case "member":
      return choice.sId === memberSId;
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

  const noAssigneeLabelNorm = removeDiacritics(
    PROJECT_TASK_NO_ASSIGNEE_LABEL
  ).toLowerCase();
  const showNoAssigneeRow =
    members.length !== 1 && (q === "" || noAssigneeLabelNorm.includes(q));

  const effectiveMemberSId = resolveSubmitAssigneeSId(
    choice,
    defaultAssigneeId
  );
  const selectedUser = effectiveMemberSId
    ? members.find((m) => m.sId === effectiveMemberSId)
    : null;
  const tooltip = selectedUser
    ? `Assign to ${selectedUser.fullName}${viewerUserId === selectedUser.sId ? " (you)" : ""}`
    : choice.kind === "unassigned"
      ? PROJECT_TASK_NO_ASSIGNEE_LABEL
      : "Choose assignee";

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
              UserIcon
            )
          }
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="start">
        <DropdownMenuSearchbar
          autoFocus
          name="add-task-assignee-search"
          placeholder="Search members"
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
                  label={PROJECT_TASK_NO_ASSIGNEE_LABEL}
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
                  label={`${member.fullName}${viewerUserId === member.sId ? " (you)" : ""}`}
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
              No members found
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface AddTaskComposerProps {
  projectMembers: SpaceUserType[];
  viewerUserId: string | null;
  defaultAssigneeId: string;
  /** When true, always assigns to `defaultAssigneeId` with no picker. */
  hideAssigneePicker?: boolean;
  onAdd: (text: string, assigneeSId: string | null) => Promise<boolean>;
}

export function AddTaskComposer({
  projectMembers,
  viewerUserId,
  defaultAssigneeId,
  hideAssigneePicker = false,
  onAdd,
}: AddTaskComposerProps) {
  const [text, setText] = useState("");
  const [assigneeChoice, setAssigneeChoice] = useState<AddTaskAssigneeChoice>(
    () => ({ kind: "default" })
  );
  const [isAdding, setIsAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (hideAssigneePicker || projectMembers.length !== 1) {
      return;
    }
    setAssigneeChoice((c) =>
      c.kind === "unassigned" ? { kind: "default" } : c
    );
  }, [hideAssigneePicker, projectMembers.length]);

  const submitAssigneeSId = hideAssigneePicker
    ? defaultAssigneeId
    : resolveSubmitAssigneeSId(assigneeChoice, defaultAssigneeId);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || isAdding) {
      return;
    }
    setIsAdding(true);
    const ok = await onAdd(trimmed, submitAssigneeSId);
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
          members={projectMembers}
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
        aria-label="New task"
        autoComplete="off"
        maxLength={NEW_MANUAL_TASK_MAX_CHARS}
        placeholder={MANUAL_ADD_TASK_PLACEHOLDER}
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
        label="Add"
        isLoading={isAdding}
        disabled={isAdding || !text.trim()}
        onClick={() => void handleSubmit()}
      />
    </div>
  );
}
