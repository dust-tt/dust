import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@connectors/post_upsert_hooks/document_tracker/temporal/activities";
import { DataSourceConfig } from "@connectors/types/data_source_config";

const { documentTrackerActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minute",
});

export async function documentTrackerHandleUpsertWorkflow(
  dataSourceConfig: DataSourceConfig,
  documentId: string
) {
  await documentTrackerActivity(dataSourceConfig, documentId);
}
