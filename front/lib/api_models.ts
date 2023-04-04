export type ApiDocument = {
  created: number;
  document_id: string;
  timestamp: number;
  tags: Array<string>;
  hash: string;
  text_size: number;
  chunk_count: number;
  chunks: Array<{
    text: string;
    hash: string;
    offset: number;
    vector: Array<number> | null;
    score: number | null;
  }>;
};
