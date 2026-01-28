import {
  condition,
  defineSignal,
  proxyActivities,
  setHandler,
} from "@temporalio/workflow";

import type * as activities from "@app/temporal/sandbox_lifecycle/activities";
import {
  DESTROY_AFTER_INACTIVITY_MS,
  PAUSE_AFTER_INACTIVITY_MS,
} from "@app/temporal/sandbox_lifecycle/config";

const { pauseSandboxActivity, destroySandboxActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
});

// Signal sent when sandbox is used (command executed, file read/written, etc.)
export const sandboxActivitySignal = defineSignal("sandboxActivity");

export interface SandboxLifecycleWorkflowArgs {
  serviceName: string;
}

/**
 * Per-sandbox lifecycle workflow.
 *
 * Manages automatic pause (after 20min inactivity) and destroy (after 7 days inactivity).
 * Receives signals on sandbox activity to reset the inactivity timer.
 */
export async function sandboxLifecycleWorkflow({
  serviceName,
}: SandboxLifecycleWorkflowArgs): Promise<void> {
  let lastActivityMs = Date.now();
  let isPaused = false;

  // Handle activity signals - reset the inactivity timer
  setHandler(sandboxActivitySignal, () => {
    lastActivityMs = Date.now();
    // If we were paused, the sandbox was resumed externally, so update state
    isPaused = false;
  });

  while (true) {
    const timeSinceActivityMs = Date.now() - lastActivityMs;

    if (timeSinceActivityMs >= DESTROY_AFTER_INACTIVITY_MS) {
      // 7 days of inactivity - destroy and exit
      await destroySandboxActivity({ serviceName });
      return;
    }

    if (!isPaused && timeSinceActivityMs >= PAUSE_AFTER_INACTIVITY_MS) {
      // 20 minutes of inactivity - pause
      await pauseSandboxActivity({ serviceName });
      isPaused = true;
    }

    // Calculate how long to wait until the next state transition
    let waitMs: number;
    if (isPaused) {
      // Already paused, wait until destroy threshold
      waitMs =
        DESTROY_AFTER_INACTIVITY_MS - timeSinceActivityMs + lastActivityMs;
    } else {
      // Not paused, wait until pause threshold
      waitMs = PAUSE_AFTER_INACTIVITY_MS - timeSinceActivityMs;
    }

    // Wait for either: timeout expires OR activity signal received
    // condition() returns true if the predicate becomes true, false on timeout
    const gotActivity = await condition(
      () => Date.now() - lastActivityMs < timeSinceActivityMs,
      waitMs
    );

    // If we got activity, the timer was reset and we continue the loop
    // If timeout expired, we continue the loop and check thresholds again
    if (gotActivity) {
      // Timer was reset by signal, continue loop with fresh state
      continue;
    }
  }
}
