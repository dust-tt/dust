const GDRIVE_FULL_SYNC_QUEUE_VERSION = 6;
const GDRIVE_INCREMENTAL_SYNC_QUEUE_VERSION = 9;
export const GDRIVE_FULL_SYNC_QUEUE_NAME = `google-queue-fullsync-v${GDRIVE_FULL_SYNC_QUEUE_VERSION}`;
export const GDRIVE_INCREMENTAL_SYNC_QUEUE_NAME = `google-queue-incremental-v${GDRIVE_INCREMENTAL_SYNC_QUEUE_VERSION}`;

// Maximum number of folders to sync in parallel for parallel sync workflows.
// Can be overridden via GDRIVE_MAX_CONCURRENT_FOLDER_SYNCS environment variable.
export const GDRIVE_MAX_CONCURRENT_FOLDER_SYNCS = 5;
