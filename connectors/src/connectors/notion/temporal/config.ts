const WORKFLOW_VERSION = 49;
export const QUEUE_NAME = `notion-queue-v${WORKFLOW_VERSION}`;
export const GARBAGE_COLLECT_QUEUE_NAME = `notion-gc-queue-v${WORKFLOW_VERSION}`;

// Notion's "last edited" timestamp is precise to the minute
export const SYNC_PERIOD_DURATION_MS = 60_000;

// How long to wait before checking for new pages again
export const INTERVAL_BETWEEN_SYNCS_MS = 60_000; // 1 minute

export const MAX_CONCURRENT_CHILD_WORKFLOWS = 1;
export const MAX_PAGE_IDS_PER_CHILD_WORKFLOW = 64;

export const MAX_PENDING_UPSERT_ACTIVITIES_PER_CHILD_WORKFLOW = 5;

export const MAX_PENDING_GARBAGE_COLLECTION_ACTIVITIES = 1;

// If set to true, the workflow will process all discovered resources until empty.
export const PROCESS_ALL_DISCOVERED_RESOURCES = false;

export const DATABASE_TO_CSV_MAX_SIZE = 256 * 1024 * 1024; // 256MB

// the garbageCollect function will be stopped if it runs longer than this
// (a bit less than 2 hours). This includes retries.
export const GARBAGE_COLLECT_MAX_DURATION_MS = Math.floor(
  1000 * 60 * 60 * 2 * 0.9
);

// The notion search API sometimes will return an infinite number of pages.
// This appears to be a bug in Notion's API.
// The only workaround is to limit the search pages.
export const MAX_SEARCH_PAGE_INDEX = 50_000;
export const MAX_SEARCH_PAGE_GARBAGE_COLLECTION_INDEX = 25_000;

// How long we wait before processing a database again.
// This avoids continuously processing the same huge databases over and over.
export const DATABASE_PROCESSING_INTERVAL_MS = 1000 * 60 * 60 * 24; // 24 hours
