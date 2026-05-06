import {
  MANUAL_ADD_TASK_PLACEHOLDER,
  MANUAL_ADD_TODO_INPUT_FIELD_CLASS,
  NEW_MANUAL_TASK_MAX_CHARS,
  PROJECT_TODO_EDIT_ACTION_CLUSTER_CLASS,
  PROJECT_TODO_ITEM_ROW_FRAME_CLASS,
  PROJECT_TODO_MANUAL_ADD_LEADING_ASSIGNEE_ANCHOR_CLASS,
  PROJECT_TODO_MANUAL_ADD_LEADING_CLASS,
  PROJECT_TODO_TABLE_ROW_INSET_CLASS,
  stripNewlines,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/utils";
import { removeDiacritics } from "@app/lib/utils";
import { PROJECT_TASK_NO_ASSIGNEE_LABEL } from "@app/types/project_task";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { SpaceUserType } from "@app/types/user";
import {
  Avatar,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useCallback, useMemo, useRef, useState } from "react";

export type AddTaskAssigneeChoice =
  | { kind: "default" }
  | { kind: "unassigned" }
  | { kind: "member"; sId: string };

export function resolveSubmitAssigneeSId(
  choice: AddTaskAssigneeChoice,
  defaultAssigneeSId: string
): string | null {
  switch (choice.kind) {
    case "unassigned":
      return null;
    case "default":
      return defaultAssigneeSId;
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
  defaultAssigneeSId: string
): boolean {
  switch (choice.kind) {
    case "unassigned":
      return false;
    case "default":
      return defaultAssigneeSId === memberSId;
    case "member":
      return choice.sId === memberSId;
    default:
      assertNeverAndIgnore(choice);
      return false;
  }
}

function assigneeTriggerTitleAndAria(
  choice: AddTaskAssigneeChoice,
  selectedUser: SpaceUserType | null | undefined,
  viewerUserId: string | null
): { title: string; ariaLabel: string } {
  if (selectedUser) {
    const youSuffix = viewerUserId === selectedUser.sId ? " (you)" : "";
    return {
      title: `Assign to ${selectedUser.fullName}${youSuffix} — click to change`,
      ariaLabel: `Assign to ${selectedUser.fullName}${youSuffix}, open menu to change`,
    };
  }
  switch (choice.kind) {
    case "unassigned":
      return {
        title: `${PROJECT_TASK_NO_ASSIGNEE_LABEL} — click to change assignee`,
        ariaLabel: `${PROJECT_TASK_NO_ASSIGNEE_LABEL}, open menu to change assignee`,
      };
    case "default":
    case "member":
      return {
        title: "Choose assignee",
        ariaLabel: "Choose assignee",
      };
    default:
      assertNeverAndIgnore(choice);
      return {
        title: "Choose assignee",
        ariaLabel: "Choose assignee",
      };
  }
}

function TodoRowAssigneeMenu({
  ariaNamePrefix,
  members,
  viewerUserId,
  defaultAssigneeSId,
  choice,
  onChoiceChange,
  onMenuOpenChange,
  disabled,
}: {
  ariaNamePrefix: string;
  members: SpaceUserType[];
  viewerUserId: string | null;
  defaultAssigneeSId: string;
  choice: AddTaskAssigneeChoice;
  onChoiceChange: (next: AddTaskAssigneeChoice) => void;
  onMenuOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
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

  const assigneeSearchLabelNorm = removeDiacritics(
    PROJECT_TASK_NO_ASSIGNEE_LABEL
  ).toLowerCase();
  const showNoAssigneeRow = q === "" || assigneeSearchLabelNorm.includes(q);

  let effectiveMemberSId: string | null;
  switch (choice.kind) {
    case "unassigned":
      effectiveMemberSId = null;
      break;
    case "default":
      effectiveMemberSId = defaultAssigneeSId;
      break;
    case "member":
      effectiveMemberSId = choice.sId;
      break;
    default:
      assertNeverAndIgnore(choice);
      effectiveMemberSId = null;
  }
  const selectedUser = effectiveMemberSId
    ? members.find((m) => m.sId === effectiveMemberSId)
    : null;

  const { title, ariaLabel } = assigneeTriggerTitleAndAria(
    choice,
    selectedUser,
    viewerUserId
  );

  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        onMenuOpenChange?.(nextOpen);
        if (nextOpen) {
          setSearch("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={title}
          aria-label={ariaLabel}
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            "flex size-7 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-background p-0 ring-1 ring-border/60 ring-inset hover:brightness-105",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "dark:bg-background-night dark:ring-border-night/55",
            "disabled:pointer-events-none disabled:opacity-40"
          )}
        >
          {selectedUser ? (
            <Avatar
              size="xs"
              isRounded
              visual={selectedUser.image ?? "/static/humanavatar/anonymous.png"}
            />
          ) : (
            <span
              className="block size-[1.625rem] shrink-0 rounded-full ring-1 ring-inset ring-border/70 dark:ring-border-night/60"
              aria-hidden
            />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="z-[1000] w-80 shadow-2xl ring-1 ring-border/60"
        align="start"
      >
        <DropdownMenuSearchbar
          autoFocus
          name={`${ariaNamePrefix}-assignee-search`}
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
                  key={`${ariaNamePrefix}-no-assignee`}
                  label={PROJECT_TASK_NO_ASSIGNEE_LABEL}
                  checked={choice.kind === "unassigned"}
                  onClick={() => {
                    onChoiceChange({ kind: "unassigned" });
                    setOpen(false);
                    onMenuOpenChange?.(false);
                  }}
                  onSelect={(event) => {
                    event.preventDefault();
                  }}
                />
              )}
              {showNoAssigneeRow && filteredMembers.length > 0 ? (
                <DropdownMenuSeparator />
              ) : null}
              {filteredMembers.length > 0 ? (
                filteredMembers.map((member) => (
                  <DropdownMenuCheckboxItem
                    key={`${ariaNamePrefix}-member-${member.sId}`}
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
                      defaultAssigneeSId
                    )}
                    onClick={() => {
                      onChoiceChange(
                        member.sId === defaultAssigneeSId
                          ? { kind: "default" }
                          : { kind: "member", sId: member.sId }
                      );
                      setOpen(false);
                      onMenuOpenChange?.(false);
                    }}
                    onSelect={(event) => {
                      event.preventDefault();
                    }}
                  />
                ))
              ) : !showNoAssigneeRow ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No members found
                </div>
              ) : null}
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

export function AddTodoComposer({
  projectMembers,
  viewerUserId,
  defaultAssigneeSId,
  hideAssigneePicker = false,
  onAdd,
}: {
  projectMembers: SpaceUserType[];
  viewerUserId: string | null;
  defaultAssigneeSId: string;
  /** When true, always assigns to `defaultAssigneeSId` with no picker. */
  hideAssigneePicker?: boolean;
  onAdd: (text: string, assigneeSId: string | null) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [assigneeChoice, setAssigneeChoice] = useState<AddTaskAssigneeChoice>(
    () => ({
      kind: "default",
    })
  );
  const [isAdding, setIsAdding] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const submitAssigneeSId = hideAssigneePicker
    ? defaultAssigneeSId
    : resolveSubmitAssigneeSId(assigneeChoice, defaultAssigneeSId);

  const isExpanded =
    inputFocused ||
    (!hideAssigneePicker && assigneeMenuOpen) ||
    stripNewlines(text).trim().length > 0;

  const handleSubmit = useCallback(async () => {
    const trimmed = stripNewlines(text).trim();
    if (!trimmed || isAdding) {
      return;
    }
    setIsAdding(true);
    const ok = await onAdd(trimmed, submitAssigneeSId);
    setIsAdding(false);
    if (ok) {
      setText("");
      // Re-assert focus after paint; `readOnly` keeps focus during `onAdd`, but
      // some browsers / parent updates can still drop it.
      queueMicrotask(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          setInputFocused(true);
        }
      });
    }
  }, [text, submitAssigneeSId, isAdding, onAdd]);

  const sideChromeToneClass = cn(
    "transition-opacity duration-300 ease-in-out motion-reduce:transition-none motion-reduce:duration-75",
    isExpanded ? "opacity-100" : "opacity-[0.4] hover:opacity-[0.88]"
  );

  const assigneeChromeToneClass = cn(
    "transition-[opacity,filter] duration-300 ease-in-out motion-reduce:transition-none motion-reduce:duration-75",
    isExpanded
      ? "opacity-100 grayscale-0 brightness-100"
      : "opacity-[0.42] grayscale brightness-[0.88] hover:opacity-[0.9] hover:grayscale-[0.12] hover:brightness-100"
  );

  return (
    <div ref={containerRef} className={PROJECT_TODO_TABLE_ROW_INSET_CLASS}>
      <div className={PROJECT_TODO_ITEM_ROW_FRAME_CLASS}>
        {hideAssigneePicker ? (
          <div className={PROJECT_TODO_MANUAL_ADD_LEADING_CLASS} aria-hidden />
        ) : (
          <div className={PROJECT_TODO_MANUAL_ADD_LEADING_CLASS}>
            <div
              className={cn(
                PROJECT_TODO_MANUAL_ADD_LEADING_ASSIGNEE_ANCHOR_CLASS,
                assigneeChromeToneClass
              )}
            >
              <TodoRowAssigneeMenu
                ariaNamePrefix="add-task"
                members={projectMembers}
                viewerUserId={viewerUserId}
                defaultAssigneeSId={defaultAssigneeSId}
                choice={assigneeChoice}
                onChoiceChange={setAssigneeChoice}
                onMenuOpenChange={setAssigneeMenuOpen}
                disabled={isAdding}
              />
            </div>
          </div>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <div
            className={cn(
              "box-border flex h-[2.375rem] min-h-[2.375rem] min-w-0 max-w-3xl flex-1 flex-col justify-center rounded-md",
              "border border-border/55 bg-muted-background/70 px-2 py-1.5",
              "cursor-text transition-colors hover:bg-muted-background/85 dark:border-border-night/55 dark:bg-muted-background-night/45 dark:hover:bg-muted-background-night/60",
              "focus-within:border-border-highlight focus-within:ring-2 focus-within:ring-highlight/35 dark:focus-within:border-highlight-night"
            )}
          >
            <input
              ref={inputRef}
              type="text"
              name="new-manual-project-task"
              aria-label="New task"
              autoComplete="off"
              maxLength={NEW_MANUAL_TASK_MAX_CHARS}
              placeholder={MANUAL_ADD_TASK_PLACEHOLDER}
              value={text}
              readOnly={isAdding}
              aria-busy={isAdding}
              className={cn(
                MANUAL_ADD_TODO_INPUT_FIELD_CLASS,
                isAdding && "cursor-wait opacity-60"
              )}
              onChange={(e) => setText(stripNewlines(e.target.value))}
              onFocus={() => setInputFocused(true)}
              onBlur={(e) => {
                const next = e.relatedTarget;
                if (
                  next instanceof Node &&
                  containerRef.current?.contains(next)
                ) {
                  return;
                }
                setInputFocused(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  inputRef.current?.blur();
                  setInputFocused(false);
                  return;
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
            />
          </div>
          <div
            className={cn(
              PROJECT_TODO_EDIT_ACTION_CLUSTER_CLASS,
              sideChromeToneClass
            )}
          >
            <Button
              size="sm"
              variant="highlight"
              label="Add"
              isLoading={isAdding}
              disabled={isAdding || !stripNewlines(text).trim()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void handleSubmit()}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
