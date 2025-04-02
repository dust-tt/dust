import type { ProviderVisibility } from "../connectors/connectors_api";

export const DATA_SOURCE_NODE_ID = "datasource_node_id";

export type ContentNodeType = "document" | "table" | "folder";

export type CoreAPIContentNode = {
  data_source_id: string;
  data_source_internal_id: string;
  node_id: string;
  node_type: ContentNodeType;
  timestamp: number;
  title: string;
  mime_type: string;
  provider_visibility?: ProviderVisibility;
  parent_id?: string;
  parents: string[];
  source_url?: string;
  children_count: number;
  parent_title?: string;
};
