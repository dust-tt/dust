import {
  ADD_TODO_BAR_SHELL_CLASS,
  NEW_MANUAL_TODO_MAX_CHARS,
  stripNewlines,
  TODO_TEXTAREA_FIELD_CLASS,
  useAutosizeTextArea,
} from "@app/components/assistant/conversation/space/conversations/project_todos/utils";
import { useAppRouter } from "@app/lib/platform";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useUser } from "@app/lib/swr/user";
import { timeAgoFrom } from "@app/lib/utils";
import type {
  ProjectTodoActorType,
  ProjectTodoAssigneeType,
  ProjectTodoType,
} from "@app/types/project_todo";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type {
  LightWorkspaceType,
  SpaceUserType,
  UserTypeWithWorkspaces,
} from "@app/types/user";
import {
  Avatar,
  BookOpenIcon,
  Button,
  ChatBubbleLeftRightIcon,
  ConfluenceLogo,
  cn,
  DriveLogo,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  GithubLogo,
  Icon,
  MicrosoftLogo,
  NotionLogo,
  PlusIcon,
  SlackLogo,
  Tooltip,
} from "@dust-tt/sparkle";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ── Assignee menu ─────────────────────────────────────────────────────────────

function TodoRowAssigneeMenu({
  ariaNamePrefix,
  members,
  viewerUserId,
  selectedSId,
  onSelect,
  disabled,
}: {
  ariaNamePrefix: string;
  members: SpaceUserType[];
  viewerUserId: string | null;
  selectedSId: string | null;
  onSelect: (userSId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return members;
    }
    return members.filter((m) => m.fullName.toLowerCase().includes(q));
  }, [search, members]);
  const selectedUser = members.find((m) => m.sId === selectedSId);
  const assigneeTriggerVisual =
    selectedUser?.image ?? "/static/humanavatar/anonymous.png";
  const AssigneeTriggerIcon = useMemo(
    () =>
      function AssigneeTriggerIconFn({ className }: { className?: string }) {
        return (
          <Avatar
            className={className}
            size="xxs"
            isRounded
            visual={assigneeTriggerVisual}
          />
        );
      },
    [assigneeTriggerVisual]
  );

  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setSearch("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          icon={AssigneeTriggerIcon}
          disabled={disabled}
          title={
            selectedUser
              ? `Assign to ${selectedUser.fullName}${viewerUserId === selectedUser.sId ? " (you)" : ""} — click to change`
              : "Choose assignee"
          }
          aria-label={
            selectedUser
              ? `Assign to ${selectedUser.fullName}${viewerUserId === selectedUser.sId ? " (you)" : ""}, open menu to change`
              : "Choose assignee"
          }
          className="shrink-0 focus-visible:ring-0 focus-visible:ring-offset-0 dark:focus-visible:ring-0 dark:focus-visible:ring-offset-0"
        />
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

// ── Add-todo composer ─────────────────────────────────────────────────────────

export function AddTodoComposer({
  projectMembers,
  viewerUserId,
  defaultAssigneeSId,
  onAdd,
  onClose,
}: {
  projectMembers: SpaceUserType[];
  viewerUserId: string | null;
  defaultAssigneeSId: string;
  onAdd: (text: string, assigneeSId: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [assigneeSId, setAssigneeSId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedSId = assigneeSId ?? defaultAssigneeSId;

  useAutosizeTextArea(inputRef, text, true);

  useEffect(() => {
    queueMicrotask(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !target.closest("[data-radix-popper-content-wrapper]") &&
        !stripNewlines(text).trim()
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [text, onClose]);

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
      requestAnimationFrame(() => {
        requestAnimationFrame(() => inputRef.current?.focus());
      });
    }
  }, [text, selectedSId, isAdding, onAdd]);

  return (
    <div ref={containerRef} className={ADD_TODO_BAR_SHELL_CLASS}>
      <TodoRowAssigneeMenu
        ariaNamePrefix="add-todo"
        members={projectMembers}
        viewerUserId={viewerUserId}
        selectedSId={selectedSId}
        onSelect={setAssigneeSId}
        disabled={isAdding}
      />
      <textarea
        ref={inputRef}
        name="new-manual-project-todo"
        aria-label="New to-do"
        autoComplete="off"
        rows={1}
        maxLength={NEW_MANUAL_TODO_MAX_CHARS}
        placeholder="A new awesome task..."
        value={text}
        disabled={isAdding}
        className={cn(
          TODO_TEXTAREA_FIELD_CLASS,
          "min-w-0 flex-1",
          "disabled:opacity-60"
        )}
        onChange={(e) => setText(stripNewlines(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (!stripNewlines(text).trim()) {
              onClose();
            } else {
              void handleSubmit();
            }
          }
        }}
      />
      <Tooltip
        label="Add to-do"
        trigger={
          <Button
            size="xs"
            variant="highlight"
            icon={PlusIcon}
            isLoading={isAdding}
            disabled={isAdding || !stripNewlines(text).trim() || !selectedSId}
            onClick={() => void handleSubmit()}
          />
        }
      />
    </div>
  );
}

// ── Metadata tooltip ──────────────────────────────────────────────────────────

function formatActorLabel(
  type: ProjectTodoActorType | null,
  agentId: string | null,
  userId: string | null,

  agentNameById: Map<string, string>,
  currentUser: UserTypeWithWorkspaces | null
): string {
  if (!type) {
    return "someone";
  }
  switch (type) {
    case "agent":
      if (agentId === "butler") {
        return "Dust";
      }
      const name = agentId ? agentNameById.get(agentId) : null;
      return name ? `@${name}` : "an agent";
    case "user":
      if (userId === currentUser?.sId) {
        return "you";
      }
      return "a user";
    default:
      assertNeverAndIgnore(type);
      return "someone";
  }
}

function formatFriendlyDate(value: Date | string): string {
  return `${timeAgoFrom(new Date(value).getTime(), { useLongFormat: true })} ago`;
}

interface TodoMetadataTooltipProps {
  todo: ProjectTodoType;
  agentNameById: Map<string, string>;
  children: React.ReactElement;
}

export function TodoMetadataTooltip({
  todo,
  agentNameById,
  children,
}: TodoMetadataTooltipProps) {
  const { user } = useUser();

  const creatorLabel = formatActorLabel(
    todo.createdByType,
    todo.createdByAgentConfigurationId,
    todo.createdByUserId,
    agentNameById,
    user
  );
  const doneLabel = todo.markedAsDoneByType
    ? formatActorLabel(
        todo.markedAsDoneByType,
        todo.markedAsDoneByAgentConfigurationId,
        todo.markedAsDoneByUserId,
        agentNameById,
        user
      )
    : null;

  const isAssistantWorkInProgress =
    !!todo.conversationId && todo.status === "in_progress";

  const label = (
    <div className="flex flex-col gap-1">
      {isAssistantWorkInProgress && (
        <div className="text-xs font-medium text-foreground dark:text-foreground-night">
          An Agent is working on this todo.
        </div>
      )}
      <div className="text-xs">
        Created by {creatorLabel} · {formatFriendlyDate(todo.createdAt)}
      </div>
      {todo.doneAt && doneLabel && (
        <div className="text-xs">
          Done by {doneLabel} · {formatFriendlyDate(todo.doneAt)}
        </div>
      )}
      {todo.actorRationale && (
        <div className="max-w-xs text-xs italic opacity-80">
          {todo.actorRationale}
        </div>
      )}
    </div>
  );

  return <Tooltip label={label} tooltipTriggerAsChild trigger={children} />;
}

export function useAgentNameById(
  owner: LightWorkspaceType,
  disabled?: boolean
): Map<string, string> {
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
    disabled,
  });
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agentConfigurations) {
      map.set(a.sId, a.name);
    }
    return map;
  }, [agentConfigurations]);
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function getSourceDisplay(source: ProjectTodoType["sources"][number]) {
  const sourceIconByType: Record<
    ProjectTodoType["sources"][number]["sourceType"],
    React.ComponentType
  > = {
    project_conversation: ChatBubbleLeftRightIcon,
    project_knowledge: BookOpenIcon,
    slack: SlackLogo,
    notion: NotionLogo,
    gdrive: DriveLogo,
    confluence: ConfluenceLogo,
    github: GithubLogo,
    microsoft: MicrosoftLogo,
  };

  const originalLabel = source.sourceTitle ?? source.sourceId;
  const customLabel = source.sourceType === "slack" ? "Slack thread" : null;

  return {
    icon: sourceIconByType[source.sourceType],
    label: customLabel ?? originalLabel,
    originalLabel,
    hasCustomLabel: customLabel !== null,
  };
}

export function TodoSources({
  sources,
  owner,
  isDone,
}: {
  sources: ProjectTodoType["sources"];
  owner: LightWorkspaceType;
  isDone: boolean;
}) {
  const router = useAppRouter();

  if (sources.length === 0) {
    return null;
  }

  return (
    <span
      className={cn(
        "hidden text-xs md:block",
        isDone
          ? "text-faint dark:text-faint-night line-through"
          : "text-muted-foreground dark:text-muted-foreground-night"
      )}
    >
      From{" "}
      {sources.map((source, index) => (
        <span key={`${source.sourceType}-${source.sourceId}`}>
          {index > 0 && ", "}
          <span
            className={cn(
              "relative inline-block",
              isDone &&
                "after:pointer-events-none after:absolute after:left-0 after:right-0 after:top-1/2 after:border-t after:border-current after:opacity-70"
            )}
          >
            {(() => {
              const { icon, label, originalLabel, hasCustomLabel } =
                getSourceDisplay(source);

              const trigger = (
                <button
                  type="button"
                  className="underline hover:no-underline"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    if (!source.sourceUrl) {
                      return;
                    }

                    try {
                      const currentOrigin = window.location.origin;
                      const targetUrl = new URL(
                        source.sourceUrl,
                        currentOrigin
                      );

                      if (targetUrl.origin === currentOrigin) {
                        const internalPath = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
                        void router.push(internalPath);
                        return;
                      }

                      window.open(
                        targetUrl.toString(),
                        "_blank",
                        "noopener,noreferrer"
                      );
                    } catch {
                      void router.push(source.sourceUrl);
                    }
                  }}
                >
                  <Icon
                    visual={icon}
                    size="xs"
                    className="mr-1 inline-block align-text-bottom opacity-70"
                  />
                  <span>{label}</span>
                </button>
              );

              if (!hasCustomLabel) {
                return trigger;
              }

              return <Tooltip label={originalLabel} trigger={trigger} />;
            })()}
          </span>
        </span>
      ))}
    </span>
  );
}

// ── Filter types & helpers ────────────────────────────────────────────────────

export type TodoAssigneeScope = "mine" | "all" | "users";

export interface TodoOwnerFilter {
  assigneeScope: TodoAssigneeScope;
  selectedUserSIds: string[];
}

export function formatTodoScopeLabel({
  scope,
  selectedUserSIds,
  usersBySId,
  viewerUserId,
}: {
  scope: TodoAssigneeScope;
  selectedUserSIds: Set<string>;
  usersBySId: Map<string, ProjectTodoAssigneeType>;
  viewerUserId: string | null;
}) {
  if (scope === "mine") {
    return "Your to-dos";
  }
  if (scope === "all") {
    return "Project's to-dos";
  }

  if (selectedUserSIds.size === 0) {
    return "To-dos";
  }

  if (selectedUserSIds.size === 1) {
    const [selectedUserSId] = selectedUserSIds;
    const user = usersBySId.get(selectedUserSId);
    if (!user) {
      return "To-dos";
    }

    if (viewerUserId !== null && user.sId === viewerUserId) {
      return "Your to-dos";
    }

    return `${user.fullName}'s to-dos`;
  }

  return `Selected to-dos (${selectedUserSIds.size})`;
}

export function TodoAssigneeHeader({
  user,
  viewerUserId,
}: {
  user: ProjectTodoAssigneeType | null;
  viewerUserId: string | null;
}) {
  const isYou = viewerUserId !== null && user?.sId === viewerUserId;

  return (
    <div className="mb-1 mt-2 flex items-center gap-2">
      <Tooltip
        label={user?.fullName ?? "Unknown user"}
        trigger={
          <Avatar
            size="xxs"
            isRounded
            visual={user?.image ?? "/static/humanavatar/anonymous.png"}
          />
        }
      />
      <span className="text-sm font-medium text-muted-foreground dark:text-muted-foreground-night">
        {user?.fullName ?? "Unknown user"}
        {isYou ? " (you)" : ""}
      </span>
    </div>
  );
}
