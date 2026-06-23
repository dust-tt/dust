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
  defaultAgentId: string | null;
}
