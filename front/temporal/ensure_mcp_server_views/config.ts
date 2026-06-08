const QUEUE_VERSION = 1;

export const QUEUE_NAME = `ensure-mcp-server-views-queue-v${QUEUE_VERSION}`;

export const ENSURE_MCP_SERVER_VIEWS_WORKFLOW_ID = "ensure-mcp-server-views";

export const ENSURE_MCP_SERVER_VIEWS_SCHEDULE_ID =
  "ensure-mcp-server-views-daily";

export const DEFAULT_SCAN_BATCH_SIZE = 1_000;
export const DEFAULT_WORKSPACE_CONCURRENCY = 50;
export const MAX_FAILURE_SAMPLES = 100;
