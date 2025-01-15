export type QdrantCluster = "cluster-0";
export const DEFAULT_QDRANT_CLUSTER: QdrantCluster = "cluster-0";

export interface EmbedderType {
  provider_id: string;
  model_id: string;
  splitter_id: string;
  max_chunk_size: number;
}

interface EmbedderConfigType {
  embedder: EmbedderType;
}

export type CoreAPIDataSourceConfig = {
  embedder_config: EmbedderConfigType;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  qdrant_config: {
    cluster: QdrantCluster;
    shadow_write_cluster: QdrantCluster | null;
  } | null;
};

export type CoreAPIDataSource = {
  created: number;
  data_source_id: string;
  data_source_internal_id: string;
  config: CoreAPIDataSourceConfig;
};

export type CoreAPIDataSourceDocumentSection = {
  prefix: string | null;
  content: string | null;
  sections: CoreAPIDataSourceDocumentSection[];
};

export function sectionFullText(
  section: CoreAPIDataSourceDocumentSection
): string {
  return (
    `${section.prefix || ""}${section.content || ""}` +
    section.sections.map(sectionFullText).join("")
  );
}

export type CoreAPIContentNode = {
  data_source_id: string;
  data_source_internal_id: string;
  node_id: string;
  node_type: "Document" | "Table" | "Folder";
  timestamp: number;
  title: string;
  mime_type: string;
  provider_visibility: "private" | "public" | null;
  parent_id: string | null;
  parents: string[];
  source_url: string | null;
  has_children: boolean;
};

export type CoreAPIDocument = {
  data_source_id: string;
  created: number;
  document_id: string;
  parents: string[];
  parent_id: string | null;
  timestamp: number;
  tags: string[];
  source_url?: string | null;
  hash: string;
  text_size: number;
  chunk_count: number;
  chunks: {
    text: string;
    hash: string;
    offset: number;
    vector?: number[] | null;
    score?: number | null;
  }[];
  title: string | null;
  mime_type: string | null;
  text?: string | null;
};

export type CoreAPILightDocument = {
  hash: string;
  text_size: number;
  chunk_count: number;
  token_count: number;
  created: number;
};

export type CoreAPIFolder = {
  data_source_id: string;
  folder_id: string;
  timestamp: number;
  title: string;
  parent_id: string | null;
  parents: string[];
};

export type CoreAPIDocumentVersionStatus = "latest" | "superseded" | "deleted";

export type CoreAPIDocumentVersion = {
  hash: string;
  created: number;
  status: CoreAPIDocumentVersionStatus;
};
