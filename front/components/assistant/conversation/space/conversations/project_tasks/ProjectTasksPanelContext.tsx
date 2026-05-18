import type {
  ProjectTasksPanelData,
  UseProjectTasksPanelArgs,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksPanelTypes";
import { useProjectTasksPanelState } from "@app/components/assistant/conversation/space/conversations/project_tasks/useProjectTasksPanelState";
import { createContext, type PropsWithChildren, useContext } from "react";

const ProjectTasksPanelContext = createContext<ProjectTasksPanelData | null>(
  null
);

export function useProjectTasksPanel(): ProjectTasksPanelData {
  const ctx = useContext(ProjectTasksPanelContext);
  if (!ctx) {
    throw new Error(
      "useProjectTasksPanel must be used within ProjectTasksPanelProvider"
    );
  }
  return ctx;
}

export function ProjectTasksPanelProvider({
  children,
  owner,
  spaceId,
  isReadOnly,
  taskOwnerFilter,
  onTaskOwnerFilterChange,
}: PropsWithChildren<UseProjectTasksPanelArgs>) {
  const value = useProjectTasksPanelState({
    owner,
    spaceId,
    isReadOnly,
    taskOwnerFilter,
    onTaskOwnerFilterChange,
  });

  return (
    <ProjectTasksPanelContext.Provider value={value}>
      {children}
    </ProjectTasksPanelContext.Provider>
  );
}
