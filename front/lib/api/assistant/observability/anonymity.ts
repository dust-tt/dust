// Minimum number of distinct users that must stand behind any aggregated usage
// figure before it may be surfaced. Below this floor a single person's activity
// could be isolated from the aggregate, so we decline instead. This is a static
// k-anonymity floor shared by every analytics surface that reports pooled usage
// (job-type cohorts, workspace-wide activity).
export const MIN_USERS_FOR_ANONYMITY = 5;
