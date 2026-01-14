import type { ModelId } from "@app/types";

export const PROJECT_CONTEXT_DATASOURCE_NAME = "managed-project_context";

export const getProjectContextDatasourceName = (spaceId: ModelId) => {
  return `${PROJECT_CONTEXT_DATASOURCE_NAME}_${spaceId}`;
};
