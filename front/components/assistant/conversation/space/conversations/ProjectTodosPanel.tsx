import { useAppRouter } from "@app/lib/platform";
import {
  useCleanDoneProjectTodos,
  useDeleteProjectTodo,
  useMarkProjectTodosAsRead,
  useProjectTodos,
  useUpdateProjectTodo,
} from "@app/lib/swr/projects";
import type { GetProjectTodosResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/project_todos/index";

import type {
  ProjectTodoCategory,
  ProjectTodoStatus,
  ProjectTodoType,
} from "@app/types/project_todo";
import { PROJECT_TODO_CATEGORIES } from "@app/types/project_todo";
import type { LightWorkspaceType } from "@app/types/user";
import {
  BookOpenIcon,
  Button,
  ChatBubbleLeftRightIcon,
  Checkbox,
  CircleIcon,
  cn,
  DriveLogo,
  Icon,
  IconButton,
  NotionLogo,
  SlackLogo,
  Spinner,
  SquareIcon,
  Tooltip,
  TrashIcon,
  TypingAnimation,
  WindIcon,
} from "@dust-tt/sparkle";
import { AnimatePresence, motion } from "framer-motion";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

// Total duration of the "what's new" diff animation when a user returns to a
// project with unread changes. Matches the playground feel.
const ANIMATION_MS = 600;

// Delay between first paint (page fully loaded with the "before" state showing)
// and the start of the diff animation. Gives the user a beat to register the
// current state before changes animate in.
const DIFF_ANIMATION_START_DELAY_MS = 1_000;

type TodoDiffState = "added" | "text-changed" | "to-done" | "unchanged";

function computeProjectTodoDiff(
  previousTodos: ProjectTodoType[],
  currentTodos: ProjectTodoType[]
): Map<string, TodoDiffState> {
  const previousBySId = new Map<string, ProjectTodoType>();
  for (const todo of previousTodos) {
    previousBySId.set(todo.sId, todo);
  }

  const diff = new Map<string, TodoDiffState>();
  for (const todo of currentTodos) {
    const previous = previousBySId.get(todo.sId);
    if (!previous) {
      diff.set(todo.sId, "added");
      continue;
    }
    // Status → done takes priority over text changes so we animate the checkbox
    // without competing with the typing animation on the same item.
    if (previous.status !== "done" && todo.status === "done") {
      diff.set(todo.sId, "to-done");
      continue;
    }
    if (previous.text !== todo.text) {
      diff.set(todo.sId, "text-changed");
      continue;
    }
    diff.set(todo.sId, "unchanged");
  }
  return diff;
}

// ── Category display configuration ────────────────────────────────────────────

type CategoryConfig = {
  label: string;
  icon: React.ComponentType;
  iconClassName: string;
};

const CATEGORY_CONFIG: Record<ProjectTodoCategory, CategoryConfig> = {
  to_do: {
    label: "To do",
    icon: CircleIcon,
    iconClassName: "text-blue-300 dark:text-blue-300-night",
  },
  to_know: {
    label: "To know",
    icon: SquareIcon,
    iconClassName: "text-golden-300 dark:text-golden-300-night",
  },
};

// Stable display order for categories.
const ORDERED_CATEGORIES: ProjectTodoCategory[] = [...PROJECT_TODO_CATEGORIES];

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
}: {
  todo: ProjectTodoType;
  owner: LightWorkspaceType;
}) {
  const isDone = todo.status === "done";

  return (
    <li className="flex items-start gap-2 py-0.5">
      <div className="mt-0.5 shrink-0">
        <Checkbox size="xs" checked={isDone} disabled />
      </div>
      <div className="flex flex-col gap-0.5">
        <span
          className={cn(
            "text-sm leading-5",
            isDone
              ? "text-faint dark:text-faint-night line-through"
              : "text-foreground dark:text-foreground-night"
          )}
        >
          {todo.text}
        </span>
        <TodoSources sources={todo.sources} owner={owner} isDone={isDone} />
      </div>
    </li>
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
  const { todosByCategory, activeSections } = groupTodosByCategory(todos);

  return (
    <div className="flex flex-col gap-3">
      <h3 className="heading-2xl text-foreground dark:text-foreground-night">
        Todos
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
                <ul className="flex flex-col pl-7">
                  {items.map((todo) => (
                    <ReadOnlyTodoItem
                      key={todo.sId}
                      todo={todo}
                      owner={owner}
                    />
                  ))}
                </ul>
              </div>
            );
          })}

          {activeSections.length === 0 && (
            <p className="text-sm italic text-faint dark:text-faint-night">
              All caught up!
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
  isEntering?: boolean;
  isTypingText?: boolean;
  isAutoChecked?: boolean;
}

function EditableTodoItem({
  todo,
  onToggleDone,
  onDelete,
  owner,
  isEntering = false,
  isTypingText = false,
  isAutoChecked = false,
}: EditableTodoItemProps) {
  const realIsDone = todo.status === "done";
  // When an item is transitioning to "done" as part of the diff animation, we
  // start unchecked and flip to checked after a short delay so the checkbox
  // animates visibly. For all other items the value tracks the todo directly.
  const [displayedChecked, setDisplayedChecked] = useState(
    isAutoChecked ? false : realIsDone
  );

  useEffect(() => {
    if (!isAutoChecked) {
      setDisplayedChecked(realIsDone);
      return;
    }
    const timer = window.setTimeout(() => setDisplayedChecked(true), 150);
    return () => window.clearTimeout(timer);
  }, [isAutoChecked, realIsDone]);

  const isDone = isAutoChecked ? displayedChecked : realIsDone;

  const handleToggle = () => {
    onToggleDone(todo);
  };

  return (
    <motion.li
      layout
      initial={
        isEntering ? { opacity: 0, height: 0 } : { opacity: 1, height: "auto" }
      }
      animate={{ opacity: 1, height: "auto" }}
      exit={{
        opacity: 0,
        height: 0,
        marginTop: 0,
        marginBottom: 0,
        paddingTop: 0,
        paddingBottom: 0,
      }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="group/todo flex items-center gap-2 overflow-hidden py-0.5"
    >
      <div className="shrink-0">
        <Checkbox
          size="xs"
          checked={isDone}
          isMutedAfterCheck
          onCheckedChange={() => handleToggle()}
        />
      </div>
      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 text-left"
        onClick={handleToggle}
      >
        <span
          className={cn(
            "text-sm leading-5 transition-all duration-300",
            isDone
              ? "text-faint dark:text-faint-night line-through"
              : "text-foreground dark:text-foreground-night"
          )}
        >
          {isTypingText ? (
            <TypingAnimation text={todo.text} duration={16} />
          ) : (
            todo.text
          )}
        </span>
        <TodoSources sources={todo.sources} owner={owner} isDone={isDone} />
      </button>
      <div className="shrink-0 opacity-0 transition-opacity group-hover/todo:opacity-100">
        <IconButton
          icon={TrashIcon}
          size="xs"
          variant="ghost"
          tooltip="Delete todo"
          onClick={() => onDelete(todo)}
        />
      </div>
    </motion.li>
  );
}

function EditableProjectTodosPanel({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const { todos, previousTodos, isTodosLoading, mutateTodos } = useProjectTodos(
    {
      owner,
      spaceId,
    }
  );
  const doUpdate = useUpdateProjectTodo({ owner, spaceId });
  const doDelete = useDeleteProjectTodo({ owner, spaceId });
  const doCleanDone = useCleanDoneProjectTodos({ owner, spaceId });
  const markAsRead = useMarkProjectTodosAsRead({ owner, spaceId });

  // Tracks todos being animated out during a clean operation.
  const [pendingRemovalIds, setPendingRemovalIds] = useState<Set<string>>(
    new Set()
  );
  const [isCleaning, setIsCleaning] = useState(false);

  // "What's new" diff animation state. Populated once on mount if the previous
  // snapshot differs from the current one; cleared after ANIMATION_MS so later
  // user interactions animate normally.
  const [displayedTodos, setDisplayedTodos] = useState<
    ProjectTodoType[] | null
  >(null);
  const [enteringKeys, setEnteringKeys] = useState<Set<string>>(new Set());
  const [typingKeys, setTypingKeys] = useState<Set<string>>(new Set());
  const [autoCheckedKeys, setAutoCheckedKeys] = useState<Set<string>>(
    new Set()
  );
  const hasStartedDiffAnimationRef = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: diff animation must run once on mount only; re-running on todos/previousTodos/markAsRead changes would replay the animation after user interactions.
  useEffect(() => {
    if (hasStartedDiffAnimationRef.current) {
      return;
    }
    if (isTodosLoading) {
      return;
    }
    hasStartedDiffAnimationRef.current = true;

    // Fire-and-forget mark-as-read: silent infrastructure, no notifications.
    void markAsRead();

    if (!previousTodos) {
      return;
    }

    const diff = computeProjectTodoDiff(previousTodos, todos);
    const hasChanges = Array.from(diff.values()).some((v) => v !== "unchanged");
    if (!hasChanges) {
      return;
    }

    // Render the "before" state first, then swap to the current state on the
    // next frame so framer-motion picks up the transition.
    setDisplayedTodos(previousTodos);

    const added = new Set<string>();
    const textChanged = new Set<string>();
    const toDone = new Set<string>();
    for (const [sId, state] of diff) {
      if (state === "added") {
        added.add(sId);
      } else if (state === "text-changed") {
        textChanged.add(sId);
      } else if (state === "to-done") {
        toDone.add(sId);
      }
    }

    // Hold the "before" state for a moment so the page is visibly settled
    // before the animation kicks in, then swap to the current state.
    const startId = window.setTimeout(() => {
      setDisplayedTodos(null);
      setEnteringKeys(added);
      setTypingKeys(textChanged);
      setAutoCheckedKeys(toDone);
    }, DIFF_ANIMATION_START_DELAY_MS);

    const clearId = window.setTimeout(() => {
      setEnteringKeys(new Set());
      setTypingKeys(new Set());
      setAutoCheckedKeys(new Set());
    }, DIFF_ANIMATION_START_DELAY_MS + ANIMATION_MS);

    return () => {
      window.clearTimeout(startId);
      window.clearTimeout(clearId);
    };
  }, [isTodosLoading]);

  const hasDoneItems = todos.some((t) => t.status === "done");

  const todosToRender = displayedTodos ?? todos;
  const { todosByCategory, activeSections } =
    groupTodosByCategory(todosToRender);

  // Optimistically update a todo's status in the SWR cache and send the PATCH.
  // On failure the cache is revalidated from the server.
  const handleSetStatus = useCallback(
    async (todo: ProjectTodoType, status: ProjectTodoStatus) => {
      const optimistic = (
        prev: GetProjectTodosResponseBody | undefined
      ): GetProjectTodosResponseBody => ({
        todos: (prev?.todos ?? []).map((t) =>
          t.sId === todo.sId ? { ...t, status } : t
        ),
        previousTodos: prev?.previousTodos ?? null,
        previousLastReadAt: prev?.previousLastReadAt ?? null,
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

  const handleToggleSection = useCallback(
    async (category: ProjectTodoCategory) => {
      const sectionTodos = todosByCategory[category] ?? [];
      if (sectionTodos.length === 0) {
        return;
      }

      const nextStatus: ProjectTodoStatus = sectionTodos.every(
        (t) => t.status === "done"
      )
        ? "todo"
        : "done";

      for (const todo of sectionTodos) {
        if (todo.status !== nextStatus) {
          void handleSetStatus(todo, nextStatus);
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
      }, 350);
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
          Todos
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
      {isTodosLoading ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      ) : (
        <CollapsibleTodoList>
          {/* Per-category sections */}
          {activeSections.map((cat) => {
            const config = CATEGORY_CONFIG[cat];
            const items = todosByCategory[cat] ?? [];
            const visibleItems = items.filter(
              (t) => !pendingRemovalIds.has(t.sId)
            );
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
                      className="hidden group-hover/section-title:flex"
                      checked={allDone}
                      isMutedAfterCheck
                      onCheckedChange={() => {
                        void handleToggleSection(cat);
                      }}
                    />
                  </div>
                  <h4
                    className="heading-lg cursor-pointer text-foreground dark:text-foreground-night"
                    onClick={() => {
                      void handleToggleSection(cat);
                    }}
                  >
                    {config.label}
                  </h4>
                </div>

                {/* Todo items */}
                <ul className="flex flex-col pl-7">
                  <AnimatePresence>
                    {visibleItems.map((todo) => (
                      <EditableTodoItem
                        key={todo.sId}
                        todo={todo}
                        onToggleDone={handleToggleDone}
                        onDelete={handleDelete}
                        owner={owner}
                        isEntering={enteringKeys.has(todo.sId)}
                        isTypingText={typingKeys.has(todo.sId)}
                        isAutoChecked={autoCheckedKeys.has(todo.sId)}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              </div>
            );
          })}

          {/* Empty state */}
          {activeSections.length === 0 && (
            <p className="text-sm italic text-faint dark:text-faint-night">
              All caught up!
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
