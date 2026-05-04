import { ProjectTodosPanelProvider } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosPanelContext";
import { ProjectTodosPanelMain } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosPanelMain";
import { ProjectTodosToolbar } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosToolbar";
import type { UseProjectTodosPanelArgs } from "@app/components/assistant/conversation/space/conversations/project_todos/projectTodosPanelTypes";

export { ProjectTodoCleanButton } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodoCleanButton";
export { ProjectTodoLocalSearch } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodoLocalSearch";
export { ProjectTodoScopeFilter } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodoScopeFilter";
export {
  ProjectTodosPanelProvider,
  useProjectTodosPanel,
} from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosPanelContext";
export { ProjectTodosPanelMain } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosPanelMain";
export { ProjectTodosToolbar } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosToolbar";
export type {
  ProjectTodosPanelData,
  UseProjectTodosPanelArgs,
} from "@app/components/assistant/conversation/space/conversations/project_todos/projectTodosPanelTypes";

export function EditableProjectTodosPanel(props: UseProjectTodosPanelArgs) {
  return (
    <ProjectTodosPanelProvider {...props}>
      <div className="flex flex-col gap-3">
        <ProjectTodosToolbar />
        <ProjectTodosPanelMain />
      </div>
    </ProjectTodosPanelProvider>
  );
}
