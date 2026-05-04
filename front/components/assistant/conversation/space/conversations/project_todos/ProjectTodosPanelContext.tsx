import type {
  ProjectTodosPanelData,
  UseProjectTodosPanelArgs,
} from "@app/components/assistant/conversation/space/conversations/project_todos/projectTodosPanelTypes";
import { useProjectTodosPanelState } from "@app/components/assistant/conversation/space/conversations/project_todos/useProjectTodosPanelState";
import { createContext, type PropsWithChildren, useContext } from "react";

const ProjectTodosPanelContext = createContext<ProjectTodosPanelData | null>(
  null
);

export function useProjectTodosPanel(): ProjectTodosPanelData {
  const ctx = useContext(ProjectTodosPanelContext);
  if (!ctx) {
    throw new Error(
      "useProjectTodosPanel must be used within ProjectTodosPanelProvider"
    );
  }
  return ctx;
}

export function ProjectTodosPanelProvider({
  children,
  owner,
  spaceId,
  isReadOnly,
  todoOwnerFilter,
  onTodoOwnerFilterChange,
}: PropsWithChildren<UseProjectTodosPanelArgs>) {
  const value = useProjectTodosPanelState({
    owner,
    spaceId,
    isReadOnly,
    todoOwnerFilter,
    onTodoOwnerFilterChange,
  });

  return (
    <ProjectTodosPanelContext.Provider value={value}>
      {children}
    </ProjectTodosPanelContext.Provider>
  );
}
