import { AgentPicker } from "@app/components/assistant/AgentPicker";
import {
  useSpaceConversations,
  useSpaceConversationsSummary,
} from "@app/hooks/conversations";
import { useTodoDiffAnimations } from "@app/hooks/useTodoDiffAnimations";
import { useAppRouter } from "@app/lib/platform";
import {
  useAgentConfigurations,
  useUnifiedAgentConfigurations,
} from "@app/lib/swr/assistants";
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
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import {
  compareAgentsForSort,
  GLOBAL_AGENTS_SID,
} from "@app/types/assistant/assistant";
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
  MicrosoftLogo,
  NotionLogo,
  PlayIcon,
  RobotIcon,
  SlackLogo,
  Spinner,
  TextArea,
  Tooltip,
  TrashIcon,
  TypingAnimation,
  UserGroupIcon,
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
  onStartWorking: (
    todo: ProjectTodoType,
    options?: { customMessage?: string; agentConfigurationId?: string }
  ) => Promise<void>;
  owner: LightWorkspaceType;
  activeAgents: LightAgentConfigurationType[];
  agentsLoading: boolean;
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
  activeAgents,
  agentsLoading,
  agentNameById,
  isExiting,
  isAdded,
  isEntering,
  isTyping,
  isNewlyDone,
  isStarting,
}: EditableTodoItemProps) {
  const router = useAppRouter();
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const [startCustomMessage, setStartCustomMessage] = useState("");
  const [selectedStartAgent, setSelectedStartAgent] =
    useState<LightAgentConfigurationType | null>(null);

  const isDone = todo.status === "done";
  const hasConversationLink =
    (todo.status === "in_progress" || todo.status === "done") &&
    !!todo.conversationId;
  const isDoneWithoutConversation = isDone && !hasConversationLink;
  const canEdit = viewerUserId !== null;
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

  const handleStartMenuOpenChange = (open: boolean) => {
    setStartMenuOpen(open);
    if (open) {
      setStartCustomMessage("");
      const defaultAgent =
        activeAgents.find((a) => a.sId === GLOBAL_AGENTS_SID.DUST) ??
        activeAgents[0] ??
        null;
      setSelectedStartAgent(defaultAgent);
    }
  };

  const handleConfirmStart = async () => {
    setStartMenuOpen(false);
    const agentConfigurationId =
      selectedStartAgent && selectedStartAgent.sId !== GLOBAL_AGENTS_SID.DUST
        ? selectedStartAgent.sId
        : undefined;
    await onStartWorking(todo, {
      customMessage: startCustomMessage.trim() || undefined,
      agentConfigurationId,
    });
  };

  return (
    <div
      className={cn(
        "group/todo flex items-start gap-3 rounded-md px-1 py-1",
        "transition-all duration-200 hover:bg-muted-background dark:hover:bg-muted-background-night",
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
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <button
            type="button"
            className="cursor-default text-left"
            onClick={(event) => {
              event.preventDefault();
            }}
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
          </button>
          <div className="ml-1">
            <TodoSources sources={todo.sources} owner={owner} isDone={isDone} />
          </div>
        </div>
      </TodoMetadataTooltip>
      <div className="mt-0.5 flex shrink-0 items-center gap-1 opacity-100">
        {hasConversationLink ? (
          <Tooltip
            label="Open to-do conversation"
            trigger={
              <Button
                icon={ChatBubbleLeftRightIcon}
                size="xs"
                variant="outline"
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
            }
          />
        ) : (
          canEdit &&
          !hasConversationLink &&
          (isDoneWithoutConversation ? (
            <Tooltip
              label="Reopen this to-do before starting work."
              trigger={
                <Button icon={PlayIcon} size="xs" variant="outline" disabled />
              }
            />
          ) : (
            <DropdownMenu
              modal={false}
              open={startMenuOpen}
              onOpenChange={handleStartMenuOpenChange}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  icon={PlayIcon}
                  size="xs"
                  variant="outline"
                  isLoading={isStarting}
                  disabled={isStarting}
                  tooltip="Start working on to-do"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-96 p-3">
                <div className="flex flex-col gap-3">
                  <TextArea
                    id={`todo-start-msg-${todo.sId}`}
                    aria-label="Additional instructions for the agent"
                    placeholder="(optional) Add a custom message for the agent..."
                    value={startCustomMessage}
                    rows={4}
                    onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                      setStartCustomMessage(event.target.value)
                    }
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="w-[200px] min-w-0 shrink-0">
                      <AgentPicker
                        owner={owner}
                        agents={activeAgents}
                        disabled={agentsLoading}
                        isLoading={agentsLoading}
                        mountPortal
                        showDropdownArrow
                        showFooterButtons={false}
                        side="bottom"
                        size="xs"
                        onItemClick={(agent) => setSelectedStartAgent(agent)}
                        pickerButton={
                          <Button
                            variant="ghost-secondary"
                            size="xs"
                            isSelect
                            icon={
                              selectedStartAgent
                                ? () => (
                                    <Avatar
                                      size="xxs"
                                      visual={selectedStartAgent.pictureUrl}
                                    />
                                  )
                                : RobotIcon
                            }
                            label={selectedStartAgent?.name ?? "Agent"}
                            className="max-w-full min-w-0"
                          />
                        }
                      />
                    </div>
                    <div className="w-[92px] shrink-0">
                      <Button
                        label="Go!"
                        variant="highlight"
                        size="sm"
                        className="w-full"
                        isLoading={isStarting}
                        disabled={isStarting || !selectedStartAgent}
                        onClick={() => void handleConfirmStart()}
                      />
                    </div>
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          ))
        )}
        {canEdit && (
          <div className="opacity-0 transition-opacity group-hover/todo:opacity-100">
            <Tooltip
              label="Delete to-do"
              trigger={
                <Button
                  icon={TrashIcon}
                  size="xs"
                  variant="ghost"
                  onClick={() => onDelete(todo)}
                />
              }
            />
          </div>
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
  const { agentConfigurations, isLoading: isAgentsLoading } =
    useUnifiedAgentConfigurations({
      workspaceId: owner.sId,
      disabled: isTodosLoading,
    });
  const activeAgents = useMemo(() => {
    const agents = agentConfigurations.filter((a) => a.status === "active");
    agents.sort(compareAgentsForSort);
    return agents;
  }, [agentConfigurations]);

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

  const { pendingAddedKeys, enteringKeys, typingKeys, doneFlashKeys } =
    useTodoDiffAnimations({
      ledgerScopeKey: `${owner.sId}:${spaceId}`,
      todos,
      frozenLastReadAt,
      isTodosLoading,
      markRead,
    });

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
  const assigneeLabel = selectedAssigneeLabel;

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
  const hasDoneItems = filteredTodos.some((todo) => todo.status === "done");
  const groupedTodosForAll = useMemo(() => {
    const groups = new Map<
      string,
      { user: ProjectTodoAssigneeType | null; todos: ProjectTodoType[] }
    >();

    for (const todo of filteredTodos) {
      const user = todo.user ?? usersBySId.get(todo.userId) ?? null;
      const key = user?.sId ?? `unknown-${todo.userId}`;
      const existing = groups.get(key);
      if (existing) {
        existing.todos.push(todo);
      } else {
        groups.set(key, { user, todos: [todo] });
      }
    }

    return [...groups.values()].sort((a, b) => {
      const aIsViewer = viewerUserId !== null && a.user?.sId === viewerUserId;
      const bIsViewer = viewerUserId !== null && b.user?.sId === viewerUserId;
      if (aIsViewer !== bIsViewer) {
        return aIsViewer ? -1 : 1;
      }
      const aName = a.user?.fullName ?? "";
      const bName = b.user?.fullName ?? "";
      return aName.localeCompare(bName, undefined, { sensitivity: "base" });
    });
  }, [filteredTodos, usersBySId, viewerUserId]);

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
      todos.filter((t) => t.status === "done").map((t) => t.sId)
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
  }, [doCleanDone, todos, mutateTodos]);

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
    async (
      todo: ProjectTodoType,
      options?: { customMessage?: string; agentConfigurationId?: string }
    ) => {
      setStartingTodoIds((prev) => new Set([...prev, todo.sId]));
      const result = await doStartConversation(todo.sId, {
        customMessage: options?.customMessage,
        agentConfigurationId: options?.agentConfigurationId,
      });
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
                {assigneeLabel}
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
              label="Your to-dos"
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
              icon={UserGroupIcon}
              label="Project's to-dos"
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
            tooltip="Hide all done to-dos"
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
          <div className="flex flex-col">
            {groupedTodosForAll.map((group) => (
              <div
                key={group.user?.sId ?? `unknown-${group.todos[0]?.userId}`}
                className="mb-4 last:mb-0"
              >
                <TodoAssigneeHeader
                  user={group.user}
                  viewerUserId={viewerUserId}
                />
                <div className="ml-4 flex flex-col">
                  {group.todos.map((todo) => (
                    <EditableTodoItem
                      key={todo.sId}
                      todo={todo}
                      viewerUserId={viewerUserId}
                      onToggleDone={handleToggleDone}
                      onDelete={handleDelete}
                      onStartWorking={handleStartWorking}
                      owner={owner}
                      activeAgents={activeAgents}
                      agentsLoading={isAgentsLoading}
                      agentNameById={agentNameById}
                      isExiting={pendingRemovalIds.has(todo.sId)}
                      isAdded={pendingAddedKeys.has(todo.sId)}
                      isEntering={enteringKeys.has(todo.sId)}
                      isTyping={typingKeys.has(todo.sId)}
                      isNewlyDone={doneFlashKeys.has(todo.sId)}
                      isStarting={startingTodoIds.has(todo.sId)}
                    />
                  ))}
                </div>
              </div>
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
  isReadOnly: boolean;
}

export function ProjectTodosPanel({
  owner,
  spaceId,
  isReadOnly,
}: ProjectTodosPanelProps) {
  if (isReadOnly) {
    return <ReadOnlyProjectTodosPanel owner={owner} spaceId={spaceId} />;
  }

  return <EditableProjectTodosPanel owner={owner} spaceId={spaceId} />;
}
