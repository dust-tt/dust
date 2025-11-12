import { proxyActivities, setHandler, sleep } from "@temporalio/workflow";
import assert from "assert";

import type * as activities from "@app/temporal/permissions_queue/activities";
import { updateSpacePermissionsSignal } from "@app/temporal/permissions_queue/signals";

const { updateSpacePermissions } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

export async function updateSpacePermissionsWorkflow({
  debounceMs,
  spaceId,
  workspaceId,
}: {
  debounceMs: number;
  spaceId: string;
  workspaceId: string;
}) {
  let lastSignalTime = 0;
  let currentDebounceMs = debounceMs;

  // Simplified signal handler.
  setHandler(updateSpacePermissionsSignal, (params) => {
    assert(params.length === 1, "Expected exactly one signal.");

    const [{ debounceMs: newDebounceMs }] = params;
    lastSignalTime = Date.now();

    // Update debounce time if provided.
    if (newDebounceMs) {
      currentDebounceMs = newDebounceMs;
    }
  });

  // Initial processing.
  lastSignalTime = Date.now();

  // Keep waiting until we've had no signals for `debounceMs`.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const elapsed = Date.now() - lastSignalTime;
    const remainingDebounceTime = currentDebounceMs - elapsed;

    if (remainingDebounceTime > 0) {
      await sleep(remainingDebounceTime);
    }

    if (Date.now() - lastSignalTime >= debounceMs) {
      // No new signals during debounce period, do the update and exit.
      await updateSpacePermissions({
        spaceId,
        workspaceId,
      });
      return;
    }
  }
}
