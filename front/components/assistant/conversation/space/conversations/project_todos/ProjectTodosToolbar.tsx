import { ProjectTodoCleanButton } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodoCleanButton";
import { ProjectTodoLocalSearch } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodoLocalSearch";
import { ProjectTodoScopeFilter } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodoScopeFilter";

/** Single row: scope filter · search · clean (within `ProjectTodosPanelProvider`). */
export function ProjectTodosToolbar() {
  return (
    <div className="flex items-center gap-2">
      <div className="shrink-0">
        <ProjectTodoScopeFilter />
      </div>
      <div className="min-w-0 flex-1">
        <ProjectTodoLocalSearch />
      </div>
      <div className="shrink-0">
        <ProjectTodoCleanButton />
      </div>
    </div>
  );
}
