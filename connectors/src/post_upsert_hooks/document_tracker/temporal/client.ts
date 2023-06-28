import { getTemporalClient } from "@connectors/lib/temporal";
import { documentTrackerHandleUpsertWorkflow } from "@connectors/post_upsert_hooks/document_tracker/temporal/workflows";
import { DataSourceConfig } from "@connectors/types/data_source_config";

export async function launchDocumentTrackerHandleUpsertWorkflow(
  dataSourceConfig: DataSourceConfig,
  documentId: string
) {
  const client = await getTemporalClient();

  await client.workflow.start(documentTrackerHandleUpsertWorkflow, {
    args: [dataSourceConfig, documentId],
    taskQueue: "document-tracker-queue",
    workflowId: `document_tracker_handle_upsert_${dataSourceConfig.workspaceId}_${dataSourceConfig.dataSourceName}_${documentId}`,
  });
}
