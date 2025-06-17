import { makeSlowQueueName } from "@connectors/lib/temporal_queue_routing";

const WORKFLOW_VERSION = 5;
export const QUEUE_NAME = `slack-queue-v${WORKFLOW_VERSION}`;
export const SLOW_QUEUE_NAME = makeSlowQueueName(QUEUE_NAME);
