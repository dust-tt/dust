import { ProviderVisibility } from "../front/lib/connectors_api";

export type CoreAPIContentNodeType = "Document" | "Table" | "Folder";

export type CoreAPIContentNode = {
  data_source_id: string;
  data_source_internal_id: string;
  node_id: string;
  node_type: CoreAPIContentNodeType;
  timestamp: number;
  title: string;
  mime_type: string;
  provider_visibility?: ProviderVisibility;
  parent_id?: string;
  parents: string[];
  source_url?: string;
  has_children: boolean;
  parent_title?: string;
};
