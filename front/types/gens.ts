export type GensRetrievedDocumentType = {
  dataSourceId: string;
  sourceUrl: string;
  documentId: string;
  timestamp: string;
  tags: string[];
  score: number;
  llm_score: number | null;
  chunks: {
    text: string;
    offset: number;
    score: number;
  }[];
  tokenCount: number;
  pinned: boolean | null;
};

export type GensTemplateVisibilityType = "default" | "workspace" | "user";

export type GensTemplateType = {
  name: string;
  instructions2: string;
  color: string;
  sId: string;
  visibility: GensTemplateVisibilityType;
  userId?: number;
};
