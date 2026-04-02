import {
  useCreateProjectTodo,
  useProjectTodos,
  useUpdateProjectTodo,
} from "@app/lib/swr/projects";
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
  Input,
  PlusIcon,
  Spinner,
  SquareIcon,
  TriangleIcon,
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
  need_attention: {
    label: "Need attention",
    icon: TriangleIcon,
    iconClassName: "text-warning-300 dark:text-warning-300-night",
  },
  key_decisions: {
    label: "Key decisions",
    icon: SquareIcon,
    iconClassName: "text-golden-300 dark:text-golden-300-night",
  },
  follow_ups: {
    label: "Follow-ups",
    icon: CircleIcon,
    iconClassName: "text-blue-300 dark:text-blue-300-night",
  },
  notable_updates: {
    label: "Notable updates",
    icon: CircleIcon,
    iconClassName: "text-green-300 dark:text-green-300-night",
  },
};

// Stable display order for categories.
const ORDERED_CATEGORIES: ProjectTodoCategory[] = [...PROJECT_TODO_CATEGORIES];

// ── Sub-components ─────────────────────────────────────────────────────────────

interface AddTodoFormProps {
  defaultCategory?: ProjectTodoCategory;
  onSubmit: (category: ProjectTodoCategory, text: string) => Promise<void>;
  onCancel: () => void;
  isBusy: boolean;
}

function AddTodoForm({
  defaultCategory = "follow_ups",
  onSubmit,
  onCancel,
  isBusy,
}: AddTodoFormProps) {
  const [text, setText] = useState("");
  const [category, setCategory] =
    useState<ProjectTodoCategory>(defaultCategory);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && text.trim()) {
        void onSubmit(category, text.trim());
      } else if (e.key === "Escape") {
        onCancel();
      }
    },
    [category, onCancel, onSubmit, text]
  );

  return (
    <div className="flex flex-col gap-2 pt-1">
      <Input
        autoFocus
        placeholder="What needs to be done?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isBusy}
        className="text-sm"
      />
      {/* Category selector chips */}
      <div className="flex flex-wrap gap-1">
        {ORDERED_CATEGORIES.map((cat) => {
          const config = CATEGORY_CONFIG[cat];
          const isSelected = category === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors",
                isSelected
                  ? "bg-primary-100 dark:bg-primary-100-night text-primary dark:text-primary-night font-medium"
                  : "bg-muted dark:bg-muted-night text-muted-foreground dark:text-muted-foreground-night hover:bg-primary-50 dark:hover:bg-primary-50-night"
              )}
            >
              <Icon
                visual={config.icon}
                size="xs"
                className={config.iconClassName}
              />
              {config.label}
            </button>
          );
        })}
      </div>
      {/* Submit / cancel */}
      <div className="flex gap-2">
        <Button
          size="xs"
          variant="primary"
          label="Add"
          disabled={!text.trim() || isBusy}
          isLoading={isBusy}
          onClick={() => {
            if (text.trim()) {
              void onSubmit(category, text.trim());
            }
          }}
        />
        <Button
          size="xs"
          variant="ghost"
          label="Cancel"
          onClick={onCancel}
          disabled={isBusy}
        />
      </div>
    </div>
  );
}

interface TodoItemProps {
  todo: ProjectTodoType;
  isPendingDone: boolean;
  onMarkDone: (todo: ProjectTodoType) => void;
}

function TodoItem({ todo, isPendingDone, onMarkDone }: TodoItemProps) {
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
    </li>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface ProjectTodosPanelProps {
  owner: LightWorkspaceType;
  spaceId: string;
  hasFeatureFlagProjectTodo: boolean;
}

export function ProjectTodosPanel({
  owner,
  spaceId,
  hasFeatureFlagProjectTodo,
}: ProjectTodosPanelProps) {
  const { todos, isTodosLoading, mutateTodos } = useProjectTodos({
    owner,
    spaceId,
    disabled: !hasFeatureFlagProjectTodo,
  });
  const doCreate = useCreateProjectTodo({ owner, spaceId });
  const doUpdate = useUpdateProjectTodo({ owner, spaceId });

  // Tracks todos being optimistically marked as done (shown with strikethrough).
  const [pendingDoneIds, setPendingDoneIds] = useState<Set<string>>(new Set());
  // Which section's inline add form is open, or "global" for the bottom-level form.
  const [addingTo, setAddingTo] = useState<
    ProjectTodoCategory | "global" | null
  >(null);
  const [isCreating, setIsCreating] = useState(false);

  // Group todos by category.
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
  const isEmpty = activeSections.length === 0 && !isCreating;

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

  const handleCreate = useCallback(
    async (category: ProjectTodoCategory, text: string) => {
      setIsCreating(true);
      const result = await doCreate(category, text);
      setIsCreating(false);

      if (result.isOk()) {
        setAddingTo(null);
        void mutateTodos();
      }
    },
    [doCreate, mutateTodos]
  );

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
                    <TodoItem
                      key={todo.sId}
                      todo={todo}
                      isPendingDone={pendingDoneIds.has(todo.sId)}
                      onMarkDone={handleMarkDone}
                    />
                  ))}
                </ul>

                {/* Inline add form / button for this section */}
                <div className="pl-7">
                  {addingTo === cat ? (
                    <AddTodoForm
                      defaultCategory={cat}
                      onSubmit={handleCreate}
                      onCancel={() => setAddingTo(null)}
                      isBusy={isCreating}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingTo(cat)}
                      className="flex items-center gap-1 text-xs text-muted-foreground dark:text-muted-foreground-night hover:text-foreground dark:hover:text-foreground-night transition-colors"
                    >
                      <Icon visual={PlusIcon} size="xs" />
                      Add
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {isEmpty && (
            <p className="text-sm italic text-faint dark:text-faint-night">
              All caught up!
            </p>
          )}

          {/* Global add todo */}
          {addingTo === "global" ? (
            <AddTodoForm
              onSubmit={handleCreate}
              onCancel={() => setAddingTo(null)}
              isBusy={isCreating}
            />
          ) : (
            addingTo === null && (
              <div>
                <Button
                  size="xs"
                  variant="outline"
                  icon={PlusIcon}
                  label="Add todo"
                  onClick={() => setAddingTo("global")}
                />
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
