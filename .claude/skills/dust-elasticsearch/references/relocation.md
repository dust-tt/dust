# Workspace Relocation Support

When a workspace is relocated to a different region, Elasticsearch indices need to be recreated in
the destination region.

## Step 1: Create a Relocation Activity

Add an activity function in
`temporal/relocation/activities/destination_region/front/es_indexation.ts` that recreates your
index for a given workspace:

```typescript
import { YourResource } from "@app/lib/resources/your_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { indexYourDocument } from "@app/lib/your_feature";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";

export async function recreateYourIndex({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const localLogger = logger.child({ workspaceId });

  localLogger.info("[Your Index] Recreating index for workspace.");

  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  const lightWorkspace = renderLightWorkspaceType({ workspace });

  // Fetch all entities that need to be indexed for this workspace
  const entities = await YourResource.listForWorkspace(lightWorkspace);

  localLogger.info(
    { entityCount: entities.length },
    "[Your Index] Found entities to index"
  );

  let successCount = 0;
  let errorCount = 0;

  await concurrentExecutor(
    entities,
    async (entity) => {
      const document = entity.toSearchDocument(lightWorkspace);
      const result = await indexYourDocument(document);

      if (result.isErr()) {
        localLogger.error(
          { entityId: entity.sId, error: result.error },
          "[Your Index] Failed to index document"
        );
        errorCount++;
      } else {
        successCount++;
      }
    },
    { concurrency: 10 }
  );

  localLogger.info(
    { successCount, errorCount },
    "[Your Index] Completed index recreation for workspace"
  );

  if (errorCount > 0) {
    throw new Error(
      `Failed to index ${errorCount} entities for workspace ${workspaceId}`
    );
  }
}
```

## Step 2: Call the Activity from the ES Indexation Workflow

Add a call to your activity in `temporal/relocation/workflows.ts` within the
`workspaceRelocateFrontEsIndexationWorkflow` function. This workflow is called after the `front`
tables and file storage have been relocated:

```typescript
export async function workspaceRelocateFrontEsIndexationWorkflow({
  destRegion,
  workspaceId,
}: RelocationWorkflowBase) {
  const destinationRegionActivities =
    getFrontDestinationRegionActivities(destRegion);

  // Recreate user search index.
  await destinationRegionActivities.recreateUserSearchIndex({ workspaceId });

  // Add your index here:
  await destinationRegionActivities.recreateYourIndex({ workspaceId });
}
```

## Example: User Search Index

The user search index (`front.user_search`) is recreated during relocation using this pattern. See:

- **Activity:** `temporal/relocation/activities/destination_region/front/es_indexation.ts` -
  `recreateUserSearchIndex`
- **Workflow:** `temporal/relocation/workflows.ts` -
  `workspaceRelocateFrontEsIndexationWorkflow`
