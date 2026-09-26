/**
 * @cc [owner:id13,label:backend;data-integrity] incremental-attribution-version-ordering
 * The incremental consumption attribution version MUST remain greater than the legacy attribution
 * version because both pipelines write to `agent_message_consumption_items`.
 */
export const INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION = 10;
