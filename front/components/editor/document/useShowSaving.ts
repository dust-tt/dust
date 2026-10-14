import { useDebouncedValue } from "@app/hooks/useDebounce";

// Every keystroke waits one round trip to sync: only a longer wait shows as saving.
export const SAVING_DISPLAY_DELAY_MS = 1000;

/**
 * @cc [owner:tdraier,label:product] document-saving-delay
 * Changes MUST show as saving only once they have waited `SAVING_DISPLAY_DELAY_MS` since
 * `syncingSinceMs`, the start of their wait, and MUST stop as soon as they are synced: a wait that
 * ended MUST NOT shorten the next one's delay. A wait already started when the hook mounts shows
 * at once, so it MUST be mounted where the connection starts, not per shared document.
 */
export function useShowSaving(syncingSinceMs: number | null): boolean {
  // The start of the wait, not a boolean: a wait that ended leaves no delay behind for the next.
  const { debouncedValue } = useDebouncedValue(
    syncingSinceMs,
    SAVING_DISPLAY_DELAY_MS
  );
  return syncingSinceMs !== null && debouncedValue === syncingSinceMs;
}
