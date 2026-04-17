# Indexing Data

This reference covers concrete indexing helpers, deterministic document ids, bulk writes, and
Temporal integration for asynchronous indexation.

## Step 1: Create Indexing Function

Create a file `lib/your_feature/your_index.ts`:

```typescript
import type { Result } from "@/lib/result";
import type { ElasticsearchError } from "@/lib/api/elasticsearch";
import { withEs, YOUR_INDEX_ALIAS_NAME } from "@/lib/api/elasticsearch";
import type { YourIndexData } from "@/types/your_feature/your_index";

// Generate unique document ID
function makeYourDocumentId({
  workspaceId,
  entityId,
}: {
  workspaceId: string;
  entityId: string;
}): string {
  return `${workspaceId}_${entityId}`;
}

// Store document to Elasticsearch
export async function storeYourData(
  document: YourIndexData
): Promise<Result<void, ElasticsearchError>> {
  const documentId = makeYourDocumentId({
    workspaceId: document.workspace_id,
    entityId: document.your_entity_id,
  });

  return withEs(async (client) => {
    await client.index({
      index: YOUR_INDEX_ALIAS_NAME,
      id: documentId,
      body: document,
    });
  });
}

// Update existing document
export async function updateYourData(
  documentId: string,
  partialUpdate: Partial<YourIndexData>
): Promise<Result<void, ElasticsearchError>> {
  return withEs(async (client) => {
    await client.update({
      index: YOUR_INDEX_ALIAS_NAME,
      id: documentId,
      body: {
        doc: partialUpdate,
      },
    });
  });
}

// Bulk indexing for batch operations
export async function bulkStoreYourData(
  documents: YourIndexData[]
): Promise<Result<void, ElasticsearchError>> {
  return withEs(async (client) => {
    const body = documents.flatMap((doc) => {
      const documentId = makeYourDocumentId({
        workspaceId: doc.workspace_id,
        entityId: doc.your_entity_id,
      });

      return [
        { index: { _index: YOUR_INDEX_ALIAS_NAME, _id: documentId } },
        doc,
      ];
    });

    await client.bulk({
      body,
      refresh: false, // Don't force refresh for performance
    });
  });
}
```

See examples in `lib/user_search/index.ts`.

## Step 2: Integrate with Temporal (Optional but Recommended)

For asynchronous, reliable indexing, use the shared Temporal `es_indexation` queue.

**Create activity file:** `temporal/es_indexation_queue/activities.ts`

```typescript
import { storeYourData } from "@/lib/analytics/your_index";
import type { YourIndexData } from "@/types/your_feature/your_index";

export async function storeYourAnalyticsActivity({
  entityId,
  workspaceId,
}: {
  entityId: string;
  workspaceId: string;
}): Promise<void> {
  // Fetch entity data from database
  const entity = await YourEntity.findOne({
    where: { sId: entityId },
  });

  if (!entity) {
    throw new Error(`Entity not found: ${entityId}`);
  }

  // Build document
  const document: YourIndexData = {
    workspace_id: workspaceId,
    your_entity_id: entityId,
    timestamp: new Date().toISOString(),
    // ... build your document
  };

  // Store to Elasticsearch
  const result = await storeYourData(document);

  if (result.isErr()) {
    throw new Error(`Failed to store analytics: ${result.error.message}`);
  }
}
```

**Trigger from workflow:**

```typescript
await context.workflow.executeChild(YourAnalyticsWorkflow, {
  args: [{ entityId, workspaceId }],
  workflowId: `your-analytics-${entityId}`,
});
```
