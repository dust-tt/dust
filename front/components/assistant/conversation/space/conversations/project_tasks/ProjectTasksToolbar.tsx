import { ProjectTaskLocalSearch } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTaskLocalSearch";
import { ProjectTaskScopeFilter } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTaskScopeFilter";

/** Single row: scope filter · search. */
export function ProjectTasksToolbar() {
  return (
    <div className="flex items-center gap-2">
      <div className="shrink-0">
        <ProjectTaskScopeFilter />
      </div>
      <div className="min-w-0 flex-1">
        <ProjectTaskLocalSearch />
      </div>
    </div>
  );
}
