import { useAppRouter } from "@app/lib/platform";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import {
  useCleanDoneProjectTodos,
  useDeleteProjectTodo,
  useMarkProjectTodosRead,
  useProjectTodos,
  useUpdateProjectTodo,
} from "@app/lib/swr/projects";
import { timeAgoFrom } from "@app/lib/utils";
import type { GetProjectTodosResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/project_todos/index";
import type {
  ProjectTodoActorType,
  ProjectTodoCategory,
  ProjectTodoStatus,
  ProjectTodoType,
} from "@app/types/project_todo";
import { PROJECT_TODO_CATEGORIES } from "@app/types/project_todo";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  BookOpenIcon,
  Button,
  ChatBubbleLeftRightIcon,
  Checkbox,
  ConfluenceLogo,
  cn,
  DriveLogo,
  GithubLogo,
  Icon,
  IconButton,
  MicrosoftLogo,
  NotionLogo,
  SlackLogo,
  Spinner,
  SquareIcon,
  Tooltip,
  TrashIcon,
  TriangleIcon,
  TypingAnimation,
  WindIcon,
} from "@dust-tt/sparkle";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SUMMARY_ITEM_TRANSITION_MS = 240;

// ── Category display configuration ────────────────────────────────────────────

type CategoryConfig = {
  label: string;
  icon: React.ComponentType;
  iconClassName: string;
};

const CATEGORY_CONFIG: Record<ProjectTodoCategory, CategoryConfig> = {
  to_do: {
    label: "Need to do",
    icon: TriangleIcon,
    iconClassName: "text-warning-300 dark:text-warning-300-night",
  },
  to_know: {
    label: "Need to know",
    icon: SquareIcon,
    iconClassName: "text-golden-300 dark:text-golden-300-night",
  },
};

// Stable display order for categories.
const ORDERED_CATEGORIES: ProjectTodoCategory[] = [...PROJECT_TODO_CATEGORIES];

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
      return "you";
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

  const label = (
    <div className="flex flex-col gap-1">
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
          ? "text-faint dark:text-faint-night"
          : "text-muted-foreground dark:text-muted-foreground-night"
      )}
    >
      In{" "}
      {sources.map((source, index) => (
        <span key={`${source.sourceType}-${source.sourceId}`}>
          {index > 0 && ", "}
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
                    const targetUrl = new URL(source.sourceUrl, currentOrigin);

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
      ))}
    </span>
  );
}

function CategorySectionHeader({ config }: { config: CategoryConfig }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <div className="flex h-4 w-4 items-center">
        <Icon visual={config.icon} size="xs" className={config.iconClassName} />
      </div>
      <h4 className="heading-lg text-foreground dark:text-foreground-night">
        {config.label}
      </h4>
    </div>
  );
}

function groupTodosByCategory(todos: ProjectTodoType[]) {
  const todosByCategory = todos.reduce<
    Partial<Record<ProjectTodoCategory, ProjectTodoType[]>>
  >((acc, todo) => {
    const cat = todo.category;
    const existing = acc[cat] ?? [];
    return { ...acc, [cat]: [...existing, todo] };
  }, {});

  const activeSections = ORDERED_CATEGORIES.filter(
    (cat) => (todosByCategory[cat]?.length ?? 0) > 0
  );

  return { todosByCategory, activeSections };
}

// ── Collapsible wrapper ──────────────────────────────────────────────────────

const COLLAPSED_MAX_HEIGHT_PX = 260;

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
      <div className="mt-1 shrink-0">
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
          <TodoSources sources={todo.sources} owner={owner} isDone={isDone} />
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
  const { todosByCategory, activeSections } = groupTodosByCategory(todos);

  return (
    <div className="flex flex-col gap-3">
      <h3 className="heading-2xl text-foreground dark:text-foreground-night">
        What's new?
      </h3>
      {isTodosLoading ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      ) : (
        <CollapsibleTodoList>
          {activeSections.map((cat) => {
            const config = CATEGORY_CONFIG[cat];
            const items = todosByCategory[cat] ?? [];

            return (
              <div key={cat} className="flex flex-col gap-1">
                <CategorySectionHeader config={config} />
                <div className="flex flex-col">
                  {items.map((todo) => (
                    <ReadOnlyTodoItem
                      key={todo.sId}
                      todo={todo}
                      owner={owner}
                      agentNameById={agentNameById}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {activeSections.length === 0 && (
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
  onToggleDone: (todo: ProjectTodoType) => void;
  onDelete: (todo: ProjectTodoType) => void;
  owner: LightWorkspaceType;
  agentNameById: Map<string, string>;
  isExiting: boolean;
  isAdded: boolean;
  isEntering: boolean;
  isTyping: boolean;
  isNewlyDone: boolean;
}

function EditableTodoItem({
  todo,
  onToggleDone,
  onDelete,
  owner,
  agentNameById,
  isExiting,
  isAdded,
  isEntering,
  isTyping,
  isNewlyDone,
}: EditableTodoItemProps) {
  const isDone = todo.status === "done";
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
        "group/todo flex items-start gap-3 overflow-hidden",
        "transition-all duration-200",
        isExiting
          ? "max-h-0 opacity-0"
          : isAdded && !isEntering
            ? "max-h-0 opacity-0"
            : "max-h-32 opacity-100"
      )}
    >
      <div className="mt-1 shrink-0">
        <Checkbox
          size="xs"
          checked={isDone}
          isMutedAfterCheck
          onCheckedChange={() => handleToggle()}
        />
      </div>
      <TodoMetadataTooltip todo={todo} agentNameById={agentNameById}>
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 text-left"
          onClick={handleToggle}
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
            ) : (
              todo.text
            )}
          </span>
          <TodoSources sources={todo.sources} owner={owner} isDone={isDone} />
        </button>
      </TodoMetadataTooltip>
      <div className="mt-0.5 shrink-0 opacity-0 transition-opacity group-hover/todo:opacity-100">
        <IconButton
          icon={TrashIcon}
          size="xs"
          variant="ghost"
          tooltip="Delete todo"
          onClick={() => onDelete(todo)}
        />
      </div>
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
  const { todos, lastReadAt, isTodosLoading, mutateTodos } = useProjectTodos({
    owner,
    spaceId,
  });
  const agentNameById = useAgentNameById(owner);
  const doUpdate = useUpdateProjectTodo({ owner, spaceId });
  const doDelete = useDeleteProjectTodo({ owner, spaceId });
  const doCleanDone = useCleanDoneProjectTodos({ owner, spaceId });
  const markRead = useMarkProjectTodosRead({ owner, spaceId });
  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;

  // Tracks todos being animated out during a clean operation.
  const [pendingRemovalIds, setPendingRemovalIds] = useState<Set<string>>(
    new Set()
  );
  const [isCleaning, setIsCleaning] = useState(false);

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
  const startTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRunRef = useRef(false);

  // diffKeys is intentionally excluded: it is memoized and stable during
  // animation (no SWR updates occur while animation state updates fire).
  // markReadRef is a ref — .current is updated synchronously every render so
  // it never needs to be a dep. Including either would cause the cleanup to
  // fire on every animation state update and cancel the in-flight timeouts.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional one-shot effect, see comment above
  useEffect(() => {
    if (isTodosLoading || frozenLastReadAt === undefined || hasRunRef.current) {
      return;
    }
    hasRunRef.current = true;

    const { added, newlyDone } = diffKeys;

    if (added.size === 0 && newlyDone.size === 0) {
      void markReadRef.current();
      return;
    }

    setTypingKeys(new Set(added));
    setDoneFlashKeys(new Set(newlyDone));

    startTimeoutRef.current = setTimeout(() => {
      setEnteringKeys(new Set(added));
      startTimeoutRef.current = null;
    }, 0);

    cleanupTimeoutRef.current = setTimeout(() => {
      void markReadRef.current();
      setEnteringKeys(new Set());
      setEnteredKeys(new Set(added));
      cleanupTimeoutRef.current = null;
    }, SUMMARY_ITEM_TRANSITION_MS);

    return () => {
      if (startTimeoutRef.current !== null) {
        clearTimeout(startTimeoutRef.current);
      }
      if (cleanupTimeoutRef.current !== null) {
        clearTimeout(cleanupTimeoutRef.current);
      }
    };
  }, [isTodosLoading, frozenLastReadAt]);

  const hasDoneItems = todos.some((t) => t.status === "done");

  const { todosByCategory, activeSections } = groupTodosByCategory(todos);

  // Optimistically update a todo's status in the SWR cache and send the PATCH.
  // On failure the cache is revalidated from the server.
  const handleSetStatus = useCallback(
    async (todo: ProjectTodoType, status: ProjectTodoStatus) => {
      const optimistic = (prev: GetProjectTodosResponseBody | undefined) => ({
        lastReadAt: prev?.lastReadAt ?? null,
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
    [doUpdate, mutateTodos]
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

  const handleCheckAllInSection = useCallback(
    async (category: ProjectTodoCategory) => {
      const sectionTodos = todosByCategory[category] ?? [];
      for (const todo of sectionTodos) {
        if (todo.status !== "done") {
          void handleSetStatus(todo, "done");
        }
      }
    },
    [handleSetStatus, todosByCategory]
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
  }, [doCleanDone, mutateTodos, todos]);

  const handleDelete = useCallback(
    async (todo: ProjectTodoType) => {
      const result = await doDelete(todo.sId);
      if (result.isOk()) {
        void mutateTodos();
      }
    },
    [doDelete, mutateTodos]
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="inline-flex items-center gap-2">
        <h3 className="heading-2xl text-foreground dark:text-foreground-night">
          What's new?
        </h3>
        <div className="flex-1" />
        {hasDoneItems && (
          <Button
            size="xs"
            variant="outline"
            icon={WindIcon}
            label="Clean"
            tooltip="Remove checked items"
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
          {/* Per-category sections */}
          {activeSections.map((cat) => {
            const config = CATEGORY_CONFIG[cat];
            const items = todosByCategory[cat] ?? [];
            const allDone =
              items.length > 0 && items.every((t) => t.status === "done");

            return (
              <div key={cat} className="flex flex-col gap-1">
                {/* Section header: icon by default, checkbox on hover */}
                <div className="group/section-title flex items-center gap-3 pt-2">
                  <div className="flex h-4 w-4 items-center">
                    <Icon
                      visual={config.icon}
                      size="xs"
                      className={cn(
                        "group-hover/section-title:hidden",
                        config.iconClassName
                      )}
                    />
                    <Checkbox
                      size="xs"
                      className="hidden group-hover/section-title:inline-block"
                      checked={allDone}
                      onCheckedChange={(checked) => {
                        if (checked === true) {
                          void handleCheckAllInSection(cat);
                        }
                      }}
                    />
                  </div>
                  <h4 className="heading-lg text-foreground dark:text-foreground-night">
                    {config.label}
                  </h4>
                </div>

                {/* Todo items */}
                <div className="flex flex-col">
                  {items.map((todo) => (
                    <EditableTodoItem
                      key={todo.sId}
                      todo={todo}
                      onToggleDone={handleToggleDone}
                      onDelete={handleDelete}
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
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {activeSections.length === 0 && (
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
