import type { PodFileTab } from "@app/types/pod_file_tab";

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
  frameTabs: PodFileTab[];
  /** System tab ids + file-tab paths before Settings. */
  tabsOrder: string[];
  defaultAgentId: string | null;
  defaultSkillIds: string[];
  isAdminControlled: boolean;
}
