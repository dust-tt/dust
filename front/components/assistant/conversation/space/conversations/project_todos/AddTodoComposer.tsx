import {
  MANUAL_ADD_TODO_INPUT_FIELD_CLASS,
  MANUAL_ADD_TODO_PLACEHOLDER,
  NEW_MANUAL_TODO_MAX_CHARS,
  PROJECT_TODO_EDIT_ACTION_CLUSTER_CLASS,
  PROJECT_TODO_ITEM_ROW_FRAME_CLASS,
  PROJECT_TODO_MANUAL_ADD_LEADING_ASSIGNEE_ANCHOR_CLASS,
  PROJECT_TODO_MANUAL_ADD_LEADING_CLASS,
  PROJECT_TODO_TABLE_ROW_INSET_CLASS,
  stripNewlines,
} from "@app/components/assistant/conversation/space/conversations/project_todos/utils";
import { removeDiacritics } from "@app/lib/utils";
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

function TodoRowAssigneeMenu({
  ariaNamePrefix,
  members,
  viewerUserId,
  selectedSId,
  onSelect,
  onMenuOpenChange,
  disabled,
}: {
  ariaNamePrefix: string;
  members: SpaceUserType[];
  viewerUserId: string | null;
  selectedSId: string | null;
  onSelect: (userSId: string) => void;
  onMenuOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filteredMembers = useMemo(() => {
    const q = removeDiacritics(search.trim()).toLowerCase();
    if (!q) {
      return [...members];
    }
    return members.filter((m) =>
      removeDiacritics(m.fullName).toLowerCase().includes(q)
    );
  }, [search, members]);
  const selectedUser = members.find((m) => m.sId === selectedSId);
  const assigneeTriggerVisual =
    selectedUser?.image ?? "/static/humanavatar/anonymous.png";
  const title = selectedUser
    ? `Assign to ${selectedUser.fullName}${viewerUserId === selectedUser.sId ? " (you)" : ""} — click to change`
    : "Choose assignee";
  const ariaLabel = selectedUser
    ? `Assign to ${selectedUser.fullName}${viewerUserId === selectedUser.sId ? " (you)" : ""}, open menu to change`
    : "Choose assignee";

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
          <Avatar size="xs" isRounded visual={assigneeTriggerVisual} />
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
          {filteredMembers.length > 0 ? (
            filteredMembers.map((member) => (
              <DropdownMenuCheckboxItem
                key={`${ariaNamePrefix}-member-${member.sId}`}
                icon={() => (
                  <Avatar
                    size="xxs"
                    isRounded
                    visual={member.image ?? "/static/humanavatar/anonymous.png"}
                  />
                )}
                label={`${member.fullName}${viewerUserId === member.sId ? " (you)" : ""}`}
                checked={selectedSId === member.sId}
                onClick={() => {
                  onSelect(member.sId);
                  setOpen(false);
                  onMenuOpenChange?.(false);
                }}
                onSelect={(event) => {
                  event.preventDefault();
                }}
              />
            ))
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
  /** When true, assignee is implicit (e.g. sole project member); no avatar control. */
  hideAssigneePicker?: boolean;
  onAdd: (text: string, assigneeSId: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [assigneeSId, setAssigneeSId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedSId = assigneeSId ?? defaultAssigneeSId;

  const isExpanded =
    inputFocused ||
    (!hideAssigneePicker && assigneeMenuOpen) ||
    stripNewlines(text).trim().length > 0;

  const handleSubmit = useCallback(async () => {
    const trimmed = stripNewlines(text).trim();
    if (!trimmed || !selectedSId || isAdding) {
      return;
    }
    setIsAdding(true);
    const ok = await onAdd(trimmed, selectedSId);
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
  }, [text, selectedSId, isAdding, onAdd]);

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
                ariaNamePrefix="add-todo"
                members={projectMembers}
                viewerUserId={viewerUserId}
                selectedSId={selectedSId}
                onSelect={setAssigneeSId}
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
              name="new-manual-project-todo"
              aria-label="New to-do"
              autoComplete="off"
              maxLength={NEW_MANUAL_TODO_MAX_CHARS}
              placeholder={MANUAL_ADD_TODO_PLACEHOLDER}
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
              disabled={isAdding || !stripNewlines(text).trim() || !selectedSId}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void handleSubmit()}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
