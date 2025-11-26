# Temporal Runbook: Creating and Using Workflows

This runbook provides step-by-step instructions for creating Temporal workflows in the Dust front codebase and integrating them into the application.

---

## Prerequisites

### Required Dependencies

```json
{
  "@temporalio/client": "^1.x.x",
  "@temporalio/workflow": "^1.x.x"
}
```

### Key Concepts

- **Workflow**: Durable function that orchestrates activities. Workflows are deterministic and can be replayed.
- **Activity**: Non-deterministic function that performs side effects (DB queries, API calls, etc.)
- **Task Queue**: Named queue where workflows and activities are executed
- **Workflow ID**: Unique identifier for a workflow execution (used for idempotency)

### Environment Setup

Temporal client configuration is in `lib/temporal.ts`. Workflows run in the "front" namespace.

---

## Overview of Current Architecture

### Key Files Structure

For each queue, you'll have:

```
temporal/your_queue/
├── config.ts          # Queue name and version
├── helpers.ts         # Workflow ID generators
├── activities.ts      # Activity implementations (DB access, side effects)
├── workflows.ts       # Workflow orchestration
├── worker.ts          # Worker setup
└── client.ts          # Workflow launcher functions
```

---

## Step-by-Step: Creating a New Workflow

### Step 1: Create Queue Configuration

Create `temporal/your_queue/config.ts`:

```typescript
const QUEUE_VERSION = 1;

export const QUEUE_NAME = `your-queue-v${QUEUE_VERSION}`;
```

**Note:** Queue versioning allows you to change queue behavior without affecting running workflows.

### Step 2: Create Workflow ID Helper

Create `temporal/your_queue/helpers.ts`:

```typescript
export function makeYourWorkflowId({ entityId }: { entityId: string }): string {
  return `your-workflow-${entityId}`;
}
```

**Important:** Workflow IDs should be:

- Unique per logical operation
- Deterministic (same inputs = same ID)
- Used for idempotency (prevents duplicate runs)

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
  // Fetch data from database
  const entity = await YourResource.fetchById(entityId);
  if (!entity) {
    throw new Error(`Entity not found: ${entityId}`);
  }

  // Perform your business logic
  const result = await entity.doSomething();

  if (result.isErr()) {
    logger.error({ entityId, error: result.error }, "Failed to process entity");
    throw new Error(`Failed to process: ${result.error.message}`);
  }
}
```

**Activities Guidelines:**

- Activities perform side effects (DB, API calls, Elasticsearch, etc.)
- Can throw errors - Temporal will retry automatically
- Should be idempotent when possible
- Use logger with structured data for observability

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

**Workflow Guidelines:**

- Workflows are deterministic - don't use `Math.random()`, `Date.now()`, etc.
- Use `proxyActivities` to call activities
- Set appropriate timeouts based on expected execution time
- Keep workflows simple - complex logic goes in activities

**Timeout Options:**

```typescript
const { yourActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes", // Max time for activity to complete
  retry: {
    maximumAttempts: 3, // Optional: limit retries
  },
});
```

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
      memo: {
        entityId,
        workspaceId,
      },
    });
    return new Ok(undefined);
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger.error(
        {
          workflowId,
          entityId,
          workspaceId,
          error: e,
        },
        "Failed starting workflow"
      );
    }

    return new Err(normalizeError(e));
  }
}
```

**Client Guidelines:**

- Returns `Result<undefined, Error>` for error handling
- Catches `WorkflowExecutionAlreadyStartedError` (not an error - workflow already running)
- Logs failures for monitoring
- Use `memo` for searchable metadata in Temporal UI

### Step 6: Create Worker

Create `temporal/your_queue/worker.ts`:

```typescript
import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@app/lib/temporal";
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
      activityInbound: [
        (ctx: Context) => {
          return new ActivityInboundLogInterceptor(ctx, logger);
        },
      ],
    },
  });

  await worker.run();
}
```

**Worker Guidelines:**

- Worker is the process that executes workflows and activities
- `maxConcurrentActivityTaskExecutions: 16` - controls parallelism
- `ActivityInboundLogInterceptor` - adds logging to all activities
- Worker name should match your queue name

### Step 7: Register Worker

Add your worker to `temporal/worker_registry.ts`:

```typescript
// 1. Add import at top
import { runYourQueueWorker } from "@app/temporal/your_queue/worker";

// 2. Add to WorkerName type
export type WorkerName =
  | "agent_loop"
  | "analytics_queue"
  // ... other workers
  | "your_queue" // <- Add this
  | "workos_events_queue";

// 3. Add to workerFunctions mapping
export const workerFunctions: Record<WorkerName, () => Promise<void>> = {
  agent_loop: runAgentLoopWorker,
  analytics_queue: runAnalyticsWorker,
  // ... other workers
  your_queue: runYourQueueWorker, // <- Add this
  workos_events_queue: runWorkOSEventsWorker,
};
```

**Registration Guidelines:**

- Worker name must match exactly in type and mapping
- Workers are started by deployment scripts
- All registered workers appear in `ALL_WORKERS` array

**Important:** Without worker registration, your workflows will never execute! The worker is what pulls tasks from the queue and executes them.

---

## Best Practices

### 1. Workflow Idempotency

**Use deterministic workflow IDs:**

```typescript
// Good: Same entity always gets same workflow ID
function makeWorkflowId({ entityId }: { entityId: string }): string {
  return `process-entity-${entityId}`;
}

// Bad: Random ID means duplicate workflows
function makeWorkflowId({ entityId }: { entityId: string }): string {
  return `process-entity-${entityId}-${Math.random()}`;
}
```

**Why:** Prevents duplicate workflow executions. If you try to start a workflow with an ID that's already running, Temporal returns `WorkflowExecutionAlreadyStartedError` instead of starting a duplicate.

### 2. Activity Retry Strategy

**Default behavior:** Temporal retries activities indefinitely with exponential backoff.

**Custom retry policy:**

```typescript
const { yourActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    maximumAttempts: 3, // Limit retries
    initialInterval: "1s", // First retry after 1s
    backoffCoefficient: 2, // Double interval each retry
    maximumInterval: "1m", // Cap retry interval
    nonRetryableErrorTypes: ["ValidationError"], // Don't retry these
  },
});
```

**When to limit retries:**

- Operations that should fail fast (user-facing errors)
- Operations where success is critical and you want to catch failures

**When to use unlimited retries:**

- Best-effort operations (analytics, indexing)
- Operations that will eventually succeed (rate limits, transient errors)

### 3. Error Handling in Activities

**Throw for retryable errors:**

```typescript
export async function yourActivity({ entityId }: { entityId: string }) {
  const result = await someOperation(entityId);

  if (result.isErr()) {
    // Temporal will retry this
    throw new Error(`Operation failed: ${result.error.message}`);
  }
}
```

**Log and continue for non-critical errors:**

```typescript
export async function yourActivity({ entityId }: { entityId: string }) {
  const result = await bestEffortOperation(entityId);

  if (result.isErr()) {
    // Log but don't throw - not critical
    logger.warn(
      { entityId, error: result.error },
      "Best effort operation failed"
    );
    return; // Continue workflow
  }
}
```

### 4. Logging Best Practices

**Use structured logging with context:**

```typescript
logger.error(
  {
    workflowId,
    entityId,
    workspaceId,
    error: normalizeError(e),
  },
  "Failed starting workflow"
);
```

**Add prefixes for searchability:**

```typescript
logger.warn({ userId, workspaceId }, "[user_search] Failed to de-index user");
```

### 5. Workflow Timeouts

**Set realistic timeouts based on expected duration:**

```typescript
// Quick operation (< 1 minute)
const { quickActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
});

// Normal operation (1-5 minutes)
const { normalActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

// Long-running operation (> 5 minutes)
const { longActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
});
```

**Note:** If activity exceeds timeout, Temporal will retry it.

### 6. Memo vs Search Attributes

**Use memo for debugging (visible in Temporal UI):**

```typescript
await client.workflow.start(yourWorkflow, {
  args: [{ entityId }],
  taskQueue: QUEUE_NAME,
  workflowId,
  memo: {
    entityId, // Useful for debugging
    workspaceId, // Useful for filtering in UI
  },
});
```

**Memo is not indexed** - use for context only, not for querying.

---

## Additional Resources

- Temporal Documentation: https://docs.temporal.io/
- TypeScript SDK: https://typescript.temporal.io/
- Workflow Determinism: https://docs.temporal.io/workflows#determinism
- Activity Retries: https://docs.temporal.io/activities#activity-retries

## Examples in Codebase

See all examples in `temporal/` directory.
