import { useAppRouter } from "@app/lib/platform";
import {
  useCleanDoneProjectTodos,
  useDeleteProjectTodo,
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
  Button,
  Checkbox,
  CircleIcon,
  cn,
  Icon,
  IconButton,
  Spinner,
  SquareIcon,
  TrashIcon,
  WindIcon,
} from "@dust-tt/sparkle";
import { AnimatePresence, motion } from "framer-motion";
import type React from "react";
import { useCallback, useState } from "react";

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
          <button
            type="button"
            className="underline hover:no-underline"
            onClick={() => {
              void router.push(source.sourceUrl ?? "");
            }}
          >
            {source.sourceTitle ?? source.sourceId}
          </button>
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
        <div className="flex flex-col gap-4">
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
        </div>
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
}

function EditableTodoItem({
  todo,
  onToggleDone,
  onDelete,
  owner,
}: EditableTodoItemProps) {
  const isDone = todo.status === "done";

  const handleToggle = () => {
    onToggleDone(todo);
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 1, height: "auto" }}
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
          {todo.text}
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
  const { todos, isTodosLoading, mutateTodos } = useProjectTodos({
    owner,
    spaceId,
  });
  const doUpdate = useUpdateProjectTodo({ owner, spaceId });
  const doDelete = useDeleteProjectTodo({ owner, spaceId });
  const doCleanDone = useCleanDoneProjectTodos({ owner, spaceId });

  // Tracks todos being animated out during a clean operation.
  const [pendingRemovalIds, setPendingRemovalIds] = useState<Set<string>>(
    new Set()
  );
  const [isCleaning, setIsCleaning] = useState(false);

  const hasDoneItems = todos.some((t) => t.status === "done");

  const { todosByCategory, activeSections } = groupTodosByCategory(todos);

  // Optimistically update a todo's status in the SWR cache and send the PATCH.
  // On failure the cache is revalidated from the server.
  const handleSetStatus = useCallback(
    async (todo: ProjectTodoType, status: ProjectTodoStatus) => {
      const optimistic = (prev: GetProjectTodosResponseBody | undefined) => ({
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

  const handleMarkSectionDone = useCallback(
    async (category: ProjectTodoCategory) => {
      const undone = (todosByCategory[category] ?? []).filter(
        (t) => t.status !== "done"
      );
      for (const todo of undone) {
        void handleSetStatus(todo, "done");
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
        <div className="flex flex-col gap-4">
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
                      onCheckedChange={(checked) => {
                        if (checked === true) {
                          void handleMarkSectionDone(cat);
                        }
                      }}
                    />
                  </div>
                  <h4 className="heading-lg text-foreground dark:text-foreground-night">
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
        </div>
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
