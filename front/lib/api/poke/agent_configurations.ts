import type { DatasourceRetrievalData } from "@app/lib/api/assistant/observability/datasource_retrieval";

export type PokeGetDatasourceRetrievalResponse = {
  datasources: DatasourceRetrievalData[];
  total: number;
};
