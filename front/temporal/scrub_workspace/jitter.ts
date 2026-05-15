export const WORKSPACE_SCRUB_JITTER_MAX_HOURS = 24;

const MINUTES_PER_HOUR = 60;
const WORKSPACE_SCRUB_JITTER_MAX_MINUTES =
  WORKSPACE_SCRUB_JITTER_MAX_HOURS * MINUTES_PER_HOUR;
const FNV_OFFSET_BASIS = 2_166_136_261;
const FNV_PRIME = 16_777_619;

export function getWorkspaceScrubJitterMinutes(workspaceId: string): number {
  let hash = FNV_OFFSET_BASIS;

  for (let i = 0; i < workspaceId.length; i++) {
    hash ^= workspaceId.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }

  return hash % WORKSPACE_SCRUB_JITTER_MAX_MINUTES;
}
