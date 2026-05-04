import { ProjectTodoLocalSearch } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodoLocalSearch";
import { ProjectTodoScopeFilter } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodoScopeFilter";
import { ProjectTodosPanelProvider } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosPanelContext";
import { ProjectTodosPanelMain } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosPanelMain";
import type { UseProjectTodosPanelArgs } from "@app/components/assistant/conversation/space/conversations/project_todos/projectTodosPanelTypes";

export { ProjectTodoLocalSearch } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodoLocalSearch";
export { ProjectTodoScopeFilter } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodoScopeFilter";
export {
  ProjectTodosPanelProvider,
  useProjectTodosPanel,
} from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosPanelContext";
export { ProjectTodosPanelMain } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosPanelMain";
export type {
  ProjectTodosPanelData,
  UseProjectTodosPanelArgs,
} from "@app/components/assistant/conversation/space/conversations/project_todos/projectTodosPanelTypes";

export function EditableProjectTodosPanel(props: UseProjectTodosPanelArgs) {
  return (
    <ProjectTodosPanelProvider {...props}>
      <ProjectTodoScopeFilter />
      <ProjectTodoLocalSearch />
      <ProjectTodosPanelMain />
    </ProjectTodosPanelProvider>
  );
}
