import { useAppRouter } from "@app/lib/platform";
import { useProjectTodos, useUpdateProjectTodo } from "@app/lib/swr/projects";
import { getConversationRoute } from "@app/lib/utils/router";
import type {
  ProjectTodoCategory,
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
  Spinner,
  SquareIcon,
  WindIcon,
} from "@dust-tt/sparkle";
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
              void router.push(
                getConversationRoute(owner.sId, source.sourceId)
              );
            }}
          >
            {source.title ?? source.sourceId}
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

function EditableTodoItem({
  todo,
  isPendingDone,
  onMarkDone,
  owner,
}: {
  todo: ProjectTodoType;
  isPendingDone: boolean;
  onMarkDone: (todo: ProjectTodoType) => void;
  owner: LightWorkspaceType;
}) {
  const isDone = isPendingDone || todo.status === "done";

  return (
    <li className="flex items-start gap-2 py-0.5">
      <div className="mt-0.5 shrink-0">
        <Checkbox
          size="xs"
          checked={isDone}
          isMutedAfterCheck
          onCheckedChange={(checked) => {
            if (checked === true && !isDone) {
              onMarkDone(todo);
            }
          }}
        />
      </div>
      <div className="flex flex-col gap-0.5">
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
      </div>
    </li>
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

  // Tracks todos being optimistically marked as done (shown with strikethrough).
  const [pendingDoneIds, setPendingDoneIds] = useState<Set<string>>(new Set());

  const { todosByCategory, activeSections } = groupTodosByCategory(todos);

  const handleMarkDone = useCallback(
    async (todo: ProjectTodoType) => {
      setPendingDoneIds((prev) => new Set([...prev, todo.sId]));

      const result = await doUpdate(todo.sId, { status: "done" });

      if (result.isErr()) {
        setPendingDoneIds((prev) => {
          const next = new Set(prev);
          next.delete(todo.sId);
          return next;
        });
        return;
      }

      // After a brief visual pause, refresh the list.
      setTimeout(() => {
        void mutateTodos();
        setPendingDoneIds((prev) => {
          const next = new Set(prev);
          next.delete(todo.sId);
          return next;
        });
      }, 600);
    },
    [doUpdate, mutateTodos]
  );

  const handleMarkSectionDone = useCallback(
    async (category: ProjectTodoCategory) => {
      const undone = (todosByCategory[category] ?? []).filter(
        (t) => t.status !== "done" && !pendingDoneIds.has(t.sId)
      );
      for (const todo of undone) {
        void handleMarkDone(todo);
      }
    },
    [handleMarkDone, pendingDoneIds, todosByCategory]
  );

  const handleClean = useCallback(() => {
    void mutateTodos();
    setPendingDoneIds(new Set());
  }, [mutateTodos]);

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="inline-flex items-center gap-2">
        <h3 className="heading-2xl text-foreground dark:text-foreground-night">
          Todos
        </h3>
        <div className="flex-1" />
        {pendingDoneIds.size > 0 && (
          <Button
            size="xs"
            variant="outline"
            icon={WindIcon}
            label="Clean"
            tooltip="Remove checked items"
            onClick={handleClean}
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
            const allPendingDone =
              items.length > 0 &&
              items.every(
                (t) => t.status === "done" || pendingDoneIds.has(t.sId)
              );

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
                      checked={allPendingDone}
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
                  {items.map((todo) => (
                    <EditableTodoItem
                      key={todo.sId}
                      todo={todo}
                      isPendingDone={pendingDoneIds.has(todo.sId)}
                      onMarkDone={handleMarkDone}
                      owner={owner}
                    />
                  ))}
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
