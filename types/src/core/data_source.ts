export type QdrantCluster = "main-0" | "dedicated-0" | "dedicated-1";

export type CoreAPIDataSourceConfig = {
  provider_id: string;
  model_id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extras?: any | null;
  splitter_id: string;
  max_chunk_size: number;
  qdrant_config: {
    cluster: QdrantCluster;
    shadow_write_cluster: QdrantCluster | null;
  } | null;
};

export type CoreAPIDataSource = {
  created: number;
  data_source_id: string;
  qdrant_collection: string;
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

export type CoreAPIDocument = {
  data_source_id: string;
  created: number;
  document_id: string;
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
  text?: string | null;
};

export type CoreAPILightDocument = {
  hash: string;
  text_size: number;
  chunk_count: number;
  token_count: number;
  created: number;
};
