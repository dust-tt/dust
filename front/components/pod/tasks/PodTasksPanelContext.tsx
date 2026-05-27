import type {
  PodTasksPanelData,
  UsePodTasksPanelArgs,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksPanelTypes";
import { usePodTasksPanelState } from "@app/components/assistant/conversation/space/conversations/project_tasks/useProjectTasksPanelState";
import { createContext, type PropsWithChildren, useContext } from "react";

const PodTasksPanelContext = createContext<PodTasksPanelData | null>(null);

export function usePodTasksPanel(): PodTasksPanelData {
  const ctx = useContext(PodTasksPanelContext);
  if (!ctx) {
    throw new Error(
      "usePodTasksPanel must be used within PodTasksPanelProvider"
    );
  }
  return ctx;
}

export function PodTasksPanelProvider({
  children,
  owner,
  podId,
  isReadOnly,
  taskOwnerFilter,
  onTaskOwnerFilterChange,
}: PropsWithChildren<UsePodTasksPanelArgs>) {
  const value = usePodTasksPanelState({
    owner,
    podId,
    isReadOnly,
    taskOwnerFilter,
    onTaskOwnerFilterChange,
  });

  return (
    <PodTasksPanelContext.Provider value={value}>
      {children}
    </PodTasksPanelContext.Provider>
  );
}
