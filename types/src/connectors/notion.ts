export type NotionGarbageCollectionMode = "always" | "auto" | "never";

export function getNotionWorkflowId(
  dataSourceInfo: { workspaceId: string; dataSourceName: string },
  gargbageCollectionMode: NotionGarbageCollectionMode = "auto"
) {
  let wfName = "workflow-notion";
  if (gargbageCollectionMode === "always") {
    wfName += "-garbage-collector";
  }
  return `${wfName}-${dataSourceInfo.workspaceId}-${dataSourceInfo.dataSourceName}`;
}
