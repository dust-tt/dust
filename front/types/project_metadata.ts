export interface PodMetadataType {
  sId: string;
  createdAt: number;
  updatedAt: number;
  spaceId: string;
  description: string | null;
  archivedAt: number | null;
  todoGenerationEnabled: boolean;
  lastTodoAnalysisAt: number | null;
  pinnedFramePath: string | null;
  // sId of the agent pre-selected for new conversations in this pod. Null = @dust.
  defaultAgentId: string | null;
}
