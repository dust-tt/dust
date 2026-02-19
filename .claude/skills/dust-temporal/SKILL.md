---
name: dust-temporal
description: Step-by-step guide for creating Temporal workflows in Dust. Use when adding background jobs, async processing, durable workflows, or task queues.
---

# Creating Temporal Workflows

This skill guides you through creating Temporal workflows for durable background processing.

## Quick Reference

### Files Structure (per queue)

```
temporal/your_queue/
├── config.ts          # Queue name and version
├── helpers.ts         # Workflow ID generators
├── activities.ts      # Activity implementations (DB, API calls)
├── workflows.ts       # Workflow orchestration
├── worker.ts          # Worker setup
└── client.ts          # Workflow launcher functions
```

### Key Concepts

- **Workflow**: Durable, deterministic function that orchestrates activities
- **Activity**: Non-deterministic function with side effects (DB, API calls)
- **Task Queue**: Named queue where workflows/activities execute
- **Workflow ID**: Unique identifier for idempotency

## Step-by-Step Implementation

### Step 1: Create Queue Configuration

Create `temporal/your_queue/config.ts`:

```typescript
const QUEUE_VERSION = 1;
export const QUEUE_NAME = `your-queue-v${QUEUE_VERSION}`;
```

### Step 2: Create Workflow ID Helper

Create `temporal/your_queue/helpers.ts`:

```typescript
export function makeYourWorkflowId({ entityId }: { entityId: string }): string {
  return `your-workflow-${entityId}`;
}
```

**Important:** Workflow IDs must be deterministic (same inputs = same ID) for idempotency.

### Step 3: Create Activities

Create `temporal/your_queue/activities.ts`:

```typescript
import { YourResource } from "@app/lib/resources/your_resource";
import logger from "@app/logger/logger";

export async function yourActivity({
  entityId,
  workspaceId,
}: {
  entityId: string;
  workspaceId: number;
}): Promise<void> {
  const entity = await YourResource.fetchById(entityId);
  if (!entity) {
    throw new Error(`Entity not found: ${entityId}`);
  }

  const result = await entity.doSomething();
  if (result.isErr()) {
    logger.error({ entityId, error: result.error }, "Failed to process entity");
    throw new Error(`Failed to process: ${result.error.message}`);
  }
}
```

**Guidelines:** Activities perform side effects, can throw (Temporal retries), should be idempotent.

### Step 4: Create Workflow

Create `temporal/your_queue/workflows.ts`:

```typescript
import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "@app/temporal/your_queue/activities";

const { yourActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export async function yourWorkflow({
  entityId,
  workspaceId,
}: {
  entityId: string;
  workspaceId: number;
}): Promise<void> {
  await yourActivity({ entityId, workspaceId });
}
```

**Guidelines:** Workflows are deterministic - no `Math.random()`, `Date.now()`, etc.

### Step 5: Create Client Launcher

Create `temporal/your_queue/client.ts`:

```typescript
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/your_queue/config";
import { makeYourWorkflowId } from "@app/temporal/your_queue/helpers";
import { yourWorkflow } from "@app/temporal/your_queue/workflows";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

export async function launchYourWorkflow({
  entityId,
  workspaceId,
}: {
  entityId: string;
  workspaceId: number;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeYourWorkflowId({ entityId });

  try {
    await client.workflow.start(yourWorkflow, {
      args: [{ entityId, workspaceId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      memo: { entityId, workspaceId },
    });
    return new Ok(undefined);
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger.error({ workflowId, entityId, workspaceId, error: e }, "Failed starting workflow");
    }
    return new Err(normalizeError(e));
  }
}
```

### Step 6: Create Worker

Create `temporal/your_queue/worker.ts`:

```typescript
import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";
import { getTemporalWorkerConnection, TEMPORAL_MAXED_CACHED_WORKFLOWS } from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import * as activities from "@app/temporal/your_queue/activities";
import { getWorkflowConfig } from "@app/temporal/bundle_helper";
import { QUEUE_NAME } from "./config";

export async function runYourQueueWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();

  const worker = await Worker.create({
    ...getWorkflowConfig({
      workerName: "your_queue",
      getWorkflowsPath: () => require.resolve("./workflows"),
    }),
    activities,
    taskQueue: QUEUE_NAME,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    maxConcurrentActivityTaskExecutions: 16,
    connection,
    namespace,
    interceptors: {
      activityInbound: [(ctx: Context) => new ActivityInboundLogInterceptor(ctx, logger)],
    },
  });

  await worker.run();
}
```

### Step 7: Register Worker (Critical!)

Edit `temporal/worker_registry.ts`:

```typescript
// 1. Add import
import { runYourQueueWorker } from "@app/temporal/your_queue/worker";

// 2. Add to WorkerName type
export type WorkerName =
  | "agent_loop"
  // ... existing workers
  | "your_queue"; // <- Add this

// 3. Add to workerFunctions mapping
export const workerFunctions: Record<WorkerName, () => Promise<void>> = {
  // ... existing workers
  your_queue: runYourQueueWorker, // <- Add this
};
```

**Without registration, workflows will never execute!**

## Timeout & Retry Configuration

```typescript
const { yourActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    maximumAttempts: 3,
    initialInterval: "1s",
    backoffCoefficient: 2,
    maximumInterval: "1m",
    nonRetryableErrorTypes: ["ValidationError"],
  },
});
```

## Validation Checklist

- [ ] Queue config created with versioned name
- [ ] Workflow ID helper is deterministic
- [ ] Activities handle errors properly
- [ ] Workflow uses `proxyActivities` with appropriate timeouts
- [ ] Client returns `Result<>` and handles `WorkflowExecutionAlreadyStartedError`
- [ ] Worker registered in `worker_registry.ts`
- [ ] Tested locally

## Reference Examples

See `temporal/` directory for existing implementations.
