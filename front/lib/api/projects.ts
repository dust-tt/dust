import type { ModelId } from "@app/types";

const PROJECT_CONTEXT_DATASOURCE_NAME = "__project_context__";

export const getProjectContextDatasourceName = (spaceId: ModelId) => {
  return `${PROJECT_CONTEXT_DATASOURCE_NAME}_${spaceId}`;
};
