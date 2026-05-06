import { ProjectTasksPanelProvider } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTasksPanelContext";
import { ProjectTasksPanelMain } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTasksPanelMain";
import { ProjectTasksToolbar } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTasksToolbar";
import type { UseProjectTasksPanelArgs } from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksPanelTypes";

export { ProjectTaskCleanButton } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTaskCleanButton";
export { ProjectTaskLocalSearch } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTaskLocalSearch";
export { ProjectTaskScopeFilter } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTaskScopeFilter";
export {
  ProjectTasksPanelProvider,
  useProjectTasksPanel,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTasksPanelContext";
export { ProjectTasksPanelMain } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTasksPanelMain";
export { ProjectTasksToolbar } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTasksToolbar";
export type {
  ProjectTasksPanelData,
  UseProjectTasksPanelArgs,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksPanelTypes";

export function EditableProjectTasksPanel(props: UseProjectTasksPanelArgs) {
  return (
    <ProjectTasksPanelProvider {...props}>
      <div className="flex flex-col gap-3">
        <ProjectTasksToolbar />
        <ProjectTasksPanelMain />
      </div>
    </ProjectTasksPanelProvider>
  );
}
