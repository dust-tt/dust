import type { ModelId } from "@app/types";

export interface ProjectType {
  id: ModelId;
  sId: string;
  name: string;
  workspaceId: ModelId;
  createdAt: number;
  updatedAt: number;
  managementMode: "manual" | "group";
  description: string | null;
}

export { createDataSourceAndConnectorForProject } from "./connector";
export {
  getProjectDataSourceFromFile,
  upsertProjectContextFile,
} from "./context";
export {
  fetchProjectDataSource,
  fetchProjectDataSourceView,
  getProjectConversationsDatasourceName,
} from "./data_sources";
export type { ProjectWithMetadata } from "./list";
export { enrichProjectsWithMetadata } from "./list";
export type {
  ConversationSearchResult,
  SearchProjectConversationsOptions,
} from "./search";
export { searchProjectConversations } from "./search";
