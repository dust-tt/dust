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
};

export type GensTemplateType = {
  name: string;
  instructions: string[];
  color: string;
  sId: string;
  visibility: string;
};
