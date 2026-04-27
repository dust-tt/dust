import {
  useSpaceConversations,
  useSpaceConversationsSummary,
} from "@app/hooks/conversations";
import { useAppRouter } from "@app/lib/platform";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import {
  useBulkUpdateProjectTodoStatus,
  useCleanDoneProjectTodos,
  useDeleteProjectTodo,
  useMarkProjectTodosRead,
  useProjectTodos,
  useStartProjectTodoConversation,
  useUpdateProjectTodo,
} from "@app/lib/swr/projects";
import { timeAgoFrom } from "@app/lib/utils";
import { getConversationRoute } from "@app/lib/utils/router";
import type { GetProjectTodosResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/project_todos/index";
import type {
  ProjectTodoActorType,
  ProjectTodoAssigneeType,
  ProjectTodoStatus,
  ProjectTodoType,
} from "@app/types/project_todo";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  AnimatedText,
  Avatar,
  BookOpenIcon,
  Button,
  ChatBubbleLeftRightIcon,
  Checkbox,
  ChevronDownIcon,
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
  IconButton,
  MicrosoftLogo,
  NotionLogo,
  PlayIcon,
  SlackLogo,
  Spinner,
  Tooltip,
  TrashIcon,
  TypingAnimation,
  UserIcon,
  WindIcon,
} from "@dust-tt/sparkle";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SUMMARY_ITEM_TRANSITION_MS = 240;

// ── Metadata tooltip ──────────────────────────────────────────────────────────

function formatActorLabel(
  type: ProjectTodoActorType | null,
  agentId: string | null,
  agentNameById: Map<string, string>
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

function TodoMetadataTooltip({
  todo,
  agentNameById,
  children,
}: TodoMetadataTooltipProps) {
  const creatorLabel = formatActorLabel(
    todo.createdByType,
    todo.createdByAgentConfigurationId,
    agentNameById
  );
  const doneLabel = todo.markedAsDoneByType
    ? formatActorLabel(
        todo.markedAsDoneByType,
        todo.markedAsDoneByAgentConfigurationId,
        agentNameById
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

function useAgentNameById(
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

function TodoSources({
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
        "text-xs",
        isDone
          ? "text-faint dark:text-faint-night line-through"
          : "text-muted-foreground dark:text-muted-foreground-night"
      )}
    >
      In{" "}
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

// ── Collapsible wrapper ──────────────────────────────────────────────────────

const COLLAPSED_MAX_HEIGHT_PX = 650;

interface CollapsibleTodoListProps {
  children: React.ReactNode;
}

function CollapsibleTodoList({ children }: CollapsibleTodoListProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsCollapse, setNeedsCollapse] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) {
      return;
    }

    const observer = new ResizeObserver(() => {
      setNeedsCollapse(el.scrollHeight > COLLAPSED_MAX_HEIGHT_PX);
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <div
          ref={contentRef}
          className="flex flex-col gap-4"
          style={{
            maxHeight:
              isExpanded || !needsCollapse
                ? undefined
                : COLLAPSED_MAX_HEIGHT_PX,
            overflow: "hidden",
            transition: "max-height 200ms ease",
          }}
        >
          {children}
        </div>
        {!isExpanded && needsCollapse && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-b from-transparent to-background dark:to-background-night" />
        )}
      </div>
      {needsCollapse && (
        <div>
          <Button
            size="xs"
            variant="outline"
            label={isExpanded ? "Show less" : "Show more"}
            onClick={() => setIsExpanded((prev) => !prev)}
          />
        </div>
      )}
    </div>
  );
}

// ── Read-only panel (archived projects) ───────────────────────────────────────

function ReadOnlyTodoItem({
  todo,
  owner,
  agentNameById,
}: {
  todo: ProjectTodoType;
  owner: LightWorkspaceType;
  agentNameById: Map<string, string>;
}) {
  const isDone = todo.status === "done";

  return (
    <div className="flex items-start gap-3 overflow-hidden">
      <div className="mt-0.5 shrink-0">
        <Checkbox size="xs" checked={isDone} disabled />
      </div>
      <TodoMetadataTooltip todo={todo} agentNameById={agentNameById}>
        <div className="flex flex-col gap-0.5">
          <span
            className={cn(
              "text-base min-h-6",
              isDone
                ? "text-faint dark:text-faint-night line-through"
                : "text-foreground dark:text-foreground-night"
            )}
          >
            {todo.text}
          </span>
          <div className="ml-1">
            <TodoSources sources={todo.sources} owner={owner} isDone={isDone} />
          </div>
        </div>
      </TodoMetadataTooltip>
    </div>
  );
}

function ReadOnlyProjectTodosPanel({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const { todos, isTodosLoading } = useProjectTodos({ owner, spaceId });
  const agentNameById = useAgentNameById(owner);

  return (
    <div className="flex flex-col gap-3">
      <h3 className="heading-2xl text-foreground dark:text-foreground-night">
        To-dos
      </h3>
      {isTodosLoading ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      ) : (
        <CollapsibleTodoList>
          <div className="flex flex-col">
            {todos.map((todo) => (
              <ReadOnlyTodoItem
                key={todo.sId}
                todo={todo}
                owner={owner}
                agentNameById={agentNameById}
              />
            ))}
          </div>
          {todos.length === 0 && (
            <p className="text-base italic text-faint dark:text-faint-night">
              You're all caught up!
            </p>
          )}
        </CollapsibleTodoList>
      )}
    </div>
  );
}

// ── Editable sub-components ───────────────────────────────────────────────────

interface EditableTodoItemProps {
  todo: ProjectTodoType;
  viewerUserId: string | null;
  onToggleDone: (todo: ProjectTodoType) => void;
  onDelete: (todo: ProjectTodoType) => void;
  onStartWorking: (todo: ProjectTodoType) => void;
  owner: LightWorkspaceType;
  agentNameById: Map<string, string>;
  isExiting: boolean;
  isAdded: boolean;
  isEntering: boolean;
  isTyping: boolean;
  isNewlyDone: boolean;
  isStarting: boolean;
}

function EditableTodoItem({
  todo,
  viewerUserId,
  onToggleDone,
  onDelete,
  onStartWorking,
  owner,
  agentNameById,
  isExiting,
  isAdded,
  isEntering,
  isTyping,
  isNewlyDone,
  isStarting,
}: EditableTodoItemProps) {
  const router = useAppRouter();
  const isDone = todo.status === "done";
  const hasConversationLink =
    (todo.status === "in_progress" || todo.status === "done") &&
    !!todo.conversationId;
  const canEdit = viewerUserId !== null && todo.userId === viewerUserId;
  const showInProgressTextAnimation = todo.status === "in_progress";
  const [isFlashing, setIsFlashing] = useState(isNewlyDone);

  useEffect(() => {
    if (!isNewlyDone) {
      return;
    }
    const timeout = setTimeout(() => setIsFlashing(false), 1000);
    return () => clearTimeout(timeout);
  }, [isNewlyDone]);

  const handleToggle = () => {
    onToggleDone(todo);
  };

  return (
    <div
      className={cn(
        "group/todo flex items-start gap-3",
        "transition-all duration-200",
        isExiting
          ? "max-h-0 overflow-hidden opacity-0"
          : isAdded && !isEntering
            ? "max-h-0 overflow-hidden opacity-0"
            : "max-h-[1000px] opacity-100"
      )}
    >
      <div className="mt-0.5 shrink-0">
        <Checkbox
          size="xs"
          checked={isDone}
          disabled={!canEdit}
          isMutedAfterCheck
          onCheckedChange={() => handleToggle()}
        />
      </div>
      <TodoMetadataTooltip todo={todo} agentNameById={agentNameById}>
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 text-left"
          onClick={handleToggle}
          disabled={!canEdit}
        >
          <span
            className={cn(
              "text-base min-h-6 transition-all duration-300",
              isDone
                ? "text-faint dark:text-faint-night line-through"
                : "text-foreground dark:text-foreground-night",
              isFlashing &&
                "rounded bg-warning-100/40 dark:bg-warning-100-night/30"
            )}
          >
            {isTyping ? (
              <TypingAnimation text={todo.text} duration={16} />
            ) : showInProgressTextAnimation ? (
              <AnimatedText variant="muted">{todo.text}</AnimatedText>
            ) : (
              todo.text
            )}
          </span>
          <div className="ml-1">
            <TodoSources sources={todo.sources} owner={owner} isDone={isDone} />
          </div>
        </button>
      </TodoMetadataTooltip>
      <div className="mt-0.5 flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/todo:opacity-100">
        {hasConversationLink ? (
          <IconButton
            icon={ChatBubbleLeftRightIcon}
            size="xs"
            variant="ghost"
            className="!text-muted-foreground hover:!text-foreground"
            tooltip={"Open todo conversation"}
            onClick={() => {
              if (!todo.conversationId) {
                return;
              }
              void router.push(
                getConversationRoute(owner.sId, todo.conversationId),
                undefined,
                { shallow: true }
              );
            }}
          />
        ) : (
          canEdit &&
          !hasConversationLink && (
            <IconButton
              icon={PlayIcon}
              size="xs"
              variant="ghost"
              className="!text-muted-foreground hover:!text-foreground"
              tooltip="Start working on todo"
              disabled={isStarting}
              onClick={() => onStartWorking(todo)}
            />
          )
        )}
        {canEdit && (
          <IconButton
            icon={TrashIcon}
            size="xs"
            variant="ghost"
            className="!text-muted-foreground hover:!text-foreground"
            tooltip="Delete todo"
            onClick={() => onDelete(todo)}
          />
        )}
      </div>
    </div>
  );
}

type TodoAssigneeScope = "mine" | "all" | "users";

function formatTodoScopeLabel({
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
    return "Your todos";
  }
  if (scope === "all") {
    return "Everyone's todos";
  }

  if (selectedUserSIds.size === 0) {
    return "Todos";
  }

  if (selectedUserSIds.size === 1) {
    const [selectedUserSId] = selectedUserSIds;
    const user = usersBySId.get(selectedUserSId);
    if (!user) {
      return "Todos";
    }

    if (viewerUserId !== null && user.sId === viewerUserId) {
      return "Your todos";
    }

    return `${user.fullName}'s todos`;
  }

  return `Selected todos (${selectedUserSIds.size})`;
}

function TodoAssigneeHeader({
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

function EditableProjectTodosPanel({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const [assigneeScope, setAssigneeScope] = useState<TodoAssigneeScope>("all");
  const [selectedUserSIds, setSelectedUserSIds] = useState<Set<string>>(
    new Set()
  );
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [isAssigneeMenuOpen, setIsAssigneeMenuOpen] = useState(false);
  const {
    todos,
    users,
    viewerUserId,
    lastReadAt,
    isTodosLoading,
    mutateTodos,
  } = useProjectTodos({
    owner,
    spaceId,
  });
  const agentNameById = useAgentNameById(owner);
  const doUpdate = useUpdateProjectTodo({ owner, spaceId });
  const doBulkUpdateStatus = useBulkUpdateProjectTodoStatus({ owner, spaceId });
  const doDelete = useDeleteProjectTodo({ owner, spaceId });
  const doStartConversation = useStartProjectTodoConversation({
    owner,
    spaceId,
  });
  const doCleanDone = useCleanDoneProjectTodos({ owner, spaceId });
  const markRead = useMarkProjectTodosRead({ owner, spaceId });

  // Disabled subscriptions used only to invalidate the space conversations list
  // and summary when a todo conversation is started — the parent page already
  // owns the active fetch for these keys.
  const { mutateConversations: mutateSpaceConversations } =
    useSpaceConversations({
      workspaceId: owner.sId,
      spaceId,
      options: { disabled: true },
    });
  const { mutate: mutateSpaceSummary } = useSpaceConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  // Tracks todos being animated out during a clean operation.
  const [pendingRemovalIds, setPendingRemovalIds] = useState<Set<string>>(
    new Set()
  );
  const [isCleaning, setIsCleaning] = useState(false);
  const [startingTodoIds, setStartingTodoIds] = useState<Set<string>>(
    new Set()
  );

  // ── Diff animation state ────────────────────────────────────────────────────

  // Frozen snapshot of lastReadAt taken on first successful load. undefined =
  // not yet captured; null = first-ever visit; string = ISO timestamp.
  // Initialized synchronously so new items start hidden from the very first
  // render with data — prevents a layout shift on unchanged items caused by
  // transitioning new items from visible→hidden after the first paint.
  const [frozenLastReadAt, setFrozenLastReadAt] = useState<
    string | null | undefined
  >(() => (!isTodosLoading ? lastReadAt : undefined));

  useEffect(() => {
    if (!isTodosLoading && frozenLastReadAt === undefined) {
      setFrozenLastReadAt(lastReadAt);
    }
  }, [isTodosLoading, frozenLastReadAt, lastReadAt]);

  const diffKeys = useMemo(() => {
    if (frozenLastReadAt === undefined || frozenLastReadAt === null) {
      return { added: new Set<string>(), newlyDone: new Set<string>() };
    }
    const cutoff = new Date(frozenLastReadAt).getTime();
    const added = new Set<string>();
    const newlyDone = new Set<string>();
    for (const t of todos) {
      if (new Date(t.createdAt).getTime() > cutoff) {
        added.add(t.sId);
      } else if (
        t.status === "done" &&
        t.doneAt &&
        new Date(t.doneAt).getTime() > cutoff
      ) {
        newlyDone.add(t.sId);
      }
    }
    return { added, newlyDone };
  }, [frozenLastReadAt, todos]);

  const [enteringKeys, setEnteringKeys] = useState<Set<string>>(new Set());
  const [enteredKeys, setEnteredKeys] = useState<Set<string>>(new Set());
  const [typingKeys, setTypingKeys] = useState<Set<string>>(new Set());
  const [doneFlashKeys, setDoneFlashKeys] = useState<Set<string>>(new Set());
  const startRaf1Ref = useRef<number | null>(null);
  const startRaf2Ref = useRef<number | null>(null);
  const cleanupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightAddedKeysRef = useRef<Set<string>>(new Set());
  const flashedDoneKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isTodosLoading || frozenLastReadAt === undefined) {
      return;
    }

    const added = new Set<string>();
    for (const sId of diffKeys.added) {
      if (!enteredKeys.has(sId) && !inFlightAddedKeysRef.current.has(sId)) {
        added.add(sId);
      }
    }

    const newlyDone = new Set<string>();
    for (const sId of diffKeys.newlyDone) {
      if (!flashedDoneKeysRef.current.has(sId)) {
        newlyDone.add(sId);
      }
    }

    if (added.size === 0 && newlyDone.size === 0) {
      return;
    }

    // Mark as read immediately so navigating away/back during animation
    // doesn't cause the same items to re-animate on next mount.
    void markRead();

    for (const sId of newlyDone) {
      flashedDoneKeysRef.current.add(sId);
    }

    if (added.size > 0) {
      inFlightAddedKeysRef.current = new Set(added);
      setTypingKeys(new Set(added));
    }
    setDoneFlashKeys((prev) => new Set([...prev, ...newlyDone]));

    // If a revalidation triggers another pass while an animation is in-flight,
    // reschedule from the latest keys instead of letting React's effect cleanup
    // cancel the previous run and leave items collapsed.
    if (startRaf1Ref.current !== null) {
      cancelAnimationFrame(startRaf1Ref.current);
      startRaf1Ref.current = null;
    }
    if (startRaf2Ref.current !== null) {
      cancelAnimationFrame(startRaf2Ref.current);
      startRaf2Ref.current = null;
    }
    if (cleanupTimeoutRef.current !== null) {
      clearTimeout(cleanupTimeoutRef.current);
      cleanupTimeoutRef.current = null;
    }
    inFlightAddedKeysRef.current = new Set();

    // Double-RAF: wait for the browser to paint the initial hidden state of
    // new items (isAdded && !isEntering → max-h-0 opacity-0) before triggering
    // the entering animation. setTimeout(0) could fire before the first paint,
    // causing items to flash visible before animating in.
    startRaf1Ref.current = requestAnimationFrame(() => {
      startRaf2Ref.current = requestAnimationFrame(() => {
        setEnteringKeys(new Set(added));
        startRaf1Ref.current = null;
        startRaf2Ref.current = null;
      });
    });

    cleanupTimeoutRef.current = setTimeout(() => {
      setEnteringKeys(new Set());
      setEnteredKeys((prev) => new Set([...prev, ...added]));
      inFlightAddedKeysRef.current = new Set();
      cleanupTimeoutRef.current = null;
    }, SUMMARY_ITEM_TRANSITION_MS);
  }, [diffKeys, frozenLastReadAt, isTodosLoading, markRead, enteredKeys]);

  // Cleanup only on unmount.
  useEffect(() => {
    return () => {
      const hadInFlightAnimation = inFlightAddedKeysRef.current.size > 0;

      if (startRaf1Ref.current !== null) {
        cancelAnimationFrame(startRaf1Ref.current);
      }
      if (startRaf2Ref.current !== null) {
        cancelAnimationFrame(startRaf2Ref.current);
      }
      if (cleanupTimeoutRef.current !== null) {
        clearTimeout(cleanupTimeoutRef.current);
      }
      inFlightAddedKeysRef.current = new Set();

      // If the user navigates away before the animation cleanup timeout runs,
      // persist the read marker so the same items don't re-animate on remount.
      if (hadInFlightAnimation) {
        void markRead();
      }
    };
  }, [markRead]);

  const usersBySId = useMemo(
    () => new Map(users.map((user) => [user.sId, user])),
    [users]
  );
  const filteredUsers = useMemo(() => {
    const normalizedSearch = assigneeSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return users;
    }

    return users.filter((user) =>
      user.fullName.toLowerCase().includes(normalizedSearch)
    );
  }, [assigneeSearch, users]);
  const selectedAssigneeLabel = formatTodoScopeLabel({
    scope: assigneeScope,
    selectedUserSIds,
    usersBySId,
    viewerUserId,
  });
  const filteredTodos = useMemo(() => {
    switch (assigneeScope) {
      case "all":
        return todos;
      case "mine":
        if (viewerUserId === null) {
          return [];
        }
        return todos.filter((todo) => todo.userId === viewerUserId);
      case "users":
        if (selectedUserSIds.size === 0) {
          return todos;
        }
        return todos.filter(
          (todo) => !!todo.user?.sId && selectedUserSIds.has(todo.user.sId)
        );
    }
  }, [assigneeScope, selectedUserSIds, todos, viewerUserId]);
  const hasDoneItems = filteredTodos.some(
    (todo) => todo.status === "done" && todo.userId === viewerUserId
  );
  const shouldGroupByAssignee =
    assigneeScope === "all" ||
    (assigneeScope === "users" && selectedUserSIds.size > 1);
  const groupedTodosForAll = useMemo(() => {
    if (!shouldGroupByAssignee) {
      return [];
    }

    const groups = new Map<
      string,
      { user: ProjectTodoAssigneeType | null; todos: ProjectTodoType[] }
    >();

    for (const todo of filteredTodos) {
      const key = todo.user?.sId ?? `unknown-${todo.userId}`;
      const existing = groups.get(key);
      if (existing) {
        existing.todos.push(todo);
      } else {
        groups.set(key, { user: todo.user, todos: [todo] });
      }
    }

    return [...groups.values()];
  }, [filteredTodos, shouldGroupByAssignee]);

  // Optimistically update a todo's status in the SWR cache and send the PATCH.
  // On failure the cache is revalidated from the server.
  const handleSetStatus = useCallback(
    async (todo: ProjectTodoType, status: ProjectTodoStatus) => {
      const optimistic = (prev: GetProjectTodosResponseBody | undefined) => ({
        lastReadAt: prev?.lastReadAt ?? null,
        viewerUserId: prev?.viewerUserId ?? viewerUserId,
        users: prev?.users ?? [],
        todos: (prev?.todos ?? []).map((t) =>
          t.sId === todo.sId ? { ...t, status } : t
        ),
      });

      void mutateTodos(optimistic, { revalidate: false });

      const result = await doUpdate(todo.sId, { status });
      if (result.isErr()) {
        // Revert: let SWR re-fetch the real server state.
        void mutateTodos();
      }
    },
    [doUpdate, mutateTodos, viewerUserId]
  );

  const handleToggleDone = useCallback(
    (todo: ProjectTodoType) => {
      if (todo.status === "done") {
        void handleSetStatus(todo, "todo");
      } else {
        void handleSetStatus(todo, "done");
      }
    },
    [handleSetStatus]
  );

  // Bulk set the status of every todo in a category in a single request.
  // Optimistically updates the SWR cache, then revalidates on failure.
  const _handleSetStatusForSection = useCallback(
    async (status: ProjectTodoStatus) => {
      const targetIds = todos
        .filter((t) => t.status !== status)
        .map((t) => t.sId);

      if (targetIds.length === 0) {
        return;
      }

      const targetIdSet = new Set(targetIds);
      const optimistic = (prev: GetProjectTodosResponseBody | undefined) => ({
        lastReadAt: prev?.lastReadAt ?? null,
        viewerUserId: prev?.viewerUserId ?? viewerUserId,
        users: prev?.users ?? [],
        todos: (prev?.todos ?? []).map((t) =>
          targetIdSet.has(t.sId) ? { ...t, status } : t
        ),
      });

      void mutateTodos(optimistic, { revalidate: false });

      const result = await doBulkUpdateStatus(targetIds, status);
      if (result.isErr()) {
        void mutateTodos();
      }
    },
    [doBulkUpdateStatus, mutateTodos, todos, viewerUserId]
  );

  const handleClean = useCallback(async () => {
    setIsCleaning(true);

    // Optimistically hide done items to trigger exit animations.
    const doneSIds = new Set(
      filteredTodos
        .filter((t) => t.status === "done" && t.userId === viewerUserId)
        .map((t) => t.sId)
    );
    setPendingRemovalIds(doneSIds);

    const result = await doCleanDone();

    if (result.isOk()) {
      // Wait for exit animations to finish, then refresh the server data.
      // pendingRemovalIds is cleared only after mutateTodos resolves so items
      // don't briefly reappear from the stale SWR cache and re-trigger the
      // exit animation.
      setTimeout(async () => {
        await mutateTodos();
        setPendingRemovalIds(new Set());
        setIsCleaning(false);
      }, SUMMARY_ITEM_TRANSITION_MS);
    } else {
      // Revert on failure.
      setPendingRemovalIds(new Set());
      setIsCleaning(false);
    }
  }, [doCleanDone, filteredTodos, mutateTodos, viewerUserId]);

  const handleDelete = useCallback(
    async (todo: ProjectTodoType) => {
      const result = await doDelete(todo.sId);
      if (result.isOk()) {
        void mutateTodos();
      }
    },
    [doDelete, mutateTodos]
  );

  const handleStartWorking = useCallback(
    async (todo: ProjectTodoType) => {
      setStartingTodoIds((prev) => new Set([...prev, todo.sId]));
      const result = await doStartConversation(todo.sId);
      if (result.isOk()) {
        const { conversationId } = result.value;
        // Reflect the new todo state (conversationId set) immediately.
        // Only patch conversationId — the server-side toJSON doesn't rehydrate
        // sources, so replacing the whole todo would transiently drop them.
        void mutateTodos(
          (prev: GetProjectTodosResponseBody | undefined) => ({
            lastReadAt: prev?.lastReadAt ?? null,
            viewerUserId: prev?.viewerUserId ?? viewerUserId,
            users: prev?.users ?? [],
            todos: (prev?.todos ?? []).map((t) =>
              t.sId === todo.sId
                ? {
                    ...t,
                    status: "in_progress",
                    doneAt: null,
                    markedAsDoneByType: null,
                    markedAsDoneByAgentConfigurationId: null,
                    conversationId,
                  }
                : t
            ),
          }),
          { revalidate: false }
        );
        // Revalidate the conversations list below so the new conversation
        // appears right away.
        void mutateSpaceConversations();
        void mutateSpaceSummary();
      }
      setStartingTodoIds((prev) => {
        const next = new Set(prev);
        next.delete(todo.sId);
        return next;
      });
    },
    [
      doStartConversation,
      mutateTodos,
      mutateSpaceConversations,
      mutateSpaceSummary,
      viewerUserId,
    ]
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="inline-flex items-center gap-2">
        <DropdownMenu
          modal={false}
          open={isAssigneeMenuOpen}
          onOpenChange={(open) => {
            setIsAssigneeMenuOpen(open);
            if (open) {
              setAssigneeSearch("");
            }
          }}
        >
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-muted/40 dark:hover:bg-muted-night/40"
            >
              <h3 className="heading-xl text-foreground dark:text-foreground-night">
                {selectedAssigneeLabel}
              </h3>
              <Icon
                visual={ChevronDownIcon}
                size="sm"
                className="text-muted-foreground dark:text-muted-foreground-night"
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="z-[1000] w-80 shadow-2xl ring-1 ring-border/60"
            align="start"
          >
            <DropdownMenuSearchbar
              autoFocus
              name="assignee-filter"
              placeholder="Search members"
              value={assigneeSearch}
              onChange={setAssigneeSearch}
            />
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              icon={UserIcon}
              label="Your todos"
              checked={assigneeScope === "mine"}
              onClick={() => {
                setAssigneeScope("mine");
                setSelectedUserSIds(new Set());
                setIsAssigneeMenuOpen(false);
              }}
              onSelect={(event) => {
                event.preventDefault();
              }}
            />
            <DropdownMenuCheckboxItem
              icon={UserIcon}
              label="Everyone's todos"
              checked={assigneeScope === "all"}
              onClick={() => {
                setAssigneeScope("all");
                setSelectedUserSIds(new Set());
                setIsAssigneeMenuOpen(false);
              }}
              onSelect={(event) => {
                event.preventDefault();
              }}
            />
            <DropdownMenuSeparator />
            <div className="max-h-64 overflow-auto">
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user) => (
                  <DropdownMenuCheckboxItem
                    key={`todo-assignee-filter-${user.sId}`}
                    icon={() => (
                      <Avatar
                        size="xxs"
                        visual={
                          user.image ?? "/static/humanavatar/anonymous.png"
                        }
                      />
                    )}
                    label={`${user.fullName}${viewerUserId === user.sId ? " (you)" : ""}`}
                    checked={
                      assigneeScope === "users" &&
                      selectedUserSIds.has(user.sId)
                    }
                    onClick={() => {
                      setSelectedUserSIds((previous) => {
                        const next = new Set(previous);
                        if (next.has(user.sId)) {
                          next.delete(user.sId);
                        } else {
                          next.add(user.sId);
                        }
                        setAssigneeScope(next.size === 0 ? "all" : "users");
                        return next;
                      });
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
        <div className="flex-1" />
        {hasDoneItems && (
          <Button
            size="xs"
            variant="outline"
            icon={WindIcon}
            label="Clean"
            tooltip="Remove your checked items"
            onClick={handleClean}
            disabled={isCleaning}
          />
        )}
      </div>

      {/* Body */}
      {isTodosLoading || frozenLastReadAt === undefined ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      ) : (
        <CollapsibleTodoList>
          {/* Todo items */}
          <div className="flex flex-col gap-2">
            {shouldGroupByAssignee
              ? groupedTodosForAll.map((group) => (
                  <div
                    key={group.user?.sId ?? `unknown-${group.todos[0]?.userId}`}
                    className="mb-4 last:mb-0"
                  >
                    <TodoAssigneeHeader
                      user={group.user}
                      viewerUserId={viewerUserId}
                    />
                    <div className="ml-4 flex flex-col gap-2">
                      {group.todos.map((todo) => (
                        <EditableTodoItem
                          key={todo.sId}
                          todo={todo}
                          viewerUserId={viewerUserId}
                          onToggleDone={handleToggleDone}
                          onDelete={handleDelete}
                          onStartWorking={handleStartWorking}
                          owner={owner}
                          agentNameById={agentNameById}
                          isExiting={pendingRemovalIds.has(todo.sId)}
                          isAdded={
                            diffKeys.added.has(todo.sId) &&
                            !enteredKeys.has(todo.sId)
                          }
                          isEntering={enteringKeys.has(todo.sId)}
                          isTyping={typingKeys.has(todo.sId)}
                          isNewlyDone={doneFlashKeys.has(todo.sId)}
                          isStarting={startingTodoIds.has(todo.sId)}
                        />
                      ))}
                    </div>
                  </div>
                ))
              : filteredTodos.map((todo) => (
                  <EditableTodoItem
                    key={todo.sId}
                    todo={todo}
                    viewerUserId={viewerUserId}
                    onToggleDone={handleToggleDone}
                    onDelete={handleDelete}
                    onStartWorking={handleStartWorking}
                    owner={owner}
                    agentNameById={agentNameById}
                    isExiting={pendingRemovalIds.has(todo.sId)}
                    isAdded={
                      diffKeys.added.has(todo.sId) && !enteredKeys.has(todo.sId)
                    }
                    isEntering={enteringKeys.has(todo.sId)}
                    isTyping={typingKeys.has(todo.sId)}
                    isNewlyDone={doneFlashKeys.has(todo.sId)}
                    isStarting={startingTodoIds.has(todo.sId)}
                  />
                ))}
          </div>

          {/* Empty state */}
          {filteredTodos.length === 0 && (
            <p className="text-base italic text-faint dark:text-faint-night">
              You're all caught up!
            </p>
          )}
        </CollapsibleTodoList>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface ProjectTodosPanelProps {
  owner: LightWorkspaceType;
  spaceId: string;
  isArchived: boolean;
}

export function ProjectTodosPanel({
  owner,
  spaceId,
  isArchived,
}: ProjectTodosPanelProps) {
  if (isArchived) {
    return <ReadOnlyProjectTodosPanel owner={owner} spaceId={spaceId} />;
  }

  return <EditableProjectTodosPanel owner={owner} spaceId={spaceId} />;
}
