import type { PodFrameTab } from "@app/types/pod_frame_tab";

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
  frameTabs: PodFrameTab[];
  /** System tab ids + frame paths before Settings. */
  tabsOrder: string[];
  defaultAgentId: string | null;
  defaultSkillIds: string[];
  isAdminControlled: boolean;
  appSharingEnabled: boolean;
}
