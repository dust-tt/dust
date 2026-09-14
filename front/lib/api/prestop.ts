import config from "@app/lib/api/config";
import { setTimeoutAsync } from "@app/lib/utils/async_utils";
import { statsDMetrics } from "@app/lib/utils/statsd";
import type { WakeLockEntry } from "@app/lib/wake_lock";
import { getWakeLockDetails, wakeLockIsFree } from "@app/lib/wake_lock";
import logger from "@app/logger/logger";

const PRESTOP_LOG_INTERVAL_MS = 1000; // 1 second log interval.
const PRESTOP_LOG_MAX_LOCKS = 3; // Show top 3 longest running wake locks.

let preStopPromise: Promise<void> | undefined;

function getLockShortId(lock: WakeLockEntry): string {
  return lock.id.substring(0, 8);
}

/**
 * Runs the full preStop shutdown sequence:
 *   1. Keep serving while Kubernetes marks the endpoint as terminating.
 *   2. Give GKE time to remove the endpoint from the NEG and drain connections.
 *   3. Observe wake locks throughout the same bounded drain window.
 *
 * Logs progress and emits statsd metrics throughout. Completes at the configured drain deadline.
 */
export function runPreStop(): Promise<void> {
  preStopPromise ??= runPreStopOnce(config.getPreStopDrainDurationMs());
  return preStopPromise;
}

async function runPreStopOnce(drainDurationMs: number): Promise<void> {
  const childLogger = logger.child({
    action: "preStop",
  });

  statsDMetrics.increment("prestop.requests");

  childLogger.info(
    { drainDurationMs },
    "Pod termination initiated. Remaining ready while Kubernetes retires the endpoint"
  );

  const preStopStartTimeMs = Date.now();
  let initialWakeLockCount: number | null = null;

  while (Date.now() - preStopStartTimeMs < drainDurationMs) {
    const wakeLockDetails = getWakeLockDetails();
    const currentWakeLockCount = wakeLockDetails.length;

    if (initialWakeLockCount === null) {
      initialWakeLockCount = currentWakeLockCount;
      childLogger.info(
        { wakeLockCount: currentWakeLockCount },
        "Starting endpoint drain window"
      );

      // Record initial wake lock metrics.
      statsDMetrics.gauge("prestop.initial_wake_locks", currentWakeLockCount);
      if (currentWakeLockCount > 0) {
        statsDMetrics.increment("prestop.has_wake_locks");
      } else {
        statsDMetrics.increment("prestop.no_wake_locks");
      }

      // Log details of all active wake locks.
      wakeLockDetails.forEach((lock, index) => {
        const durationMs = Date.now() - lock.startTime;
        const context = lock.context;
        childLogger.info(
          {
            context,
            durationSeconds: Math.round(durationMs / 1000),
            lockId: getLockShortId(lock),
            lockIndex: index + 1,
          },
          "Active wake lock details"
        );
      });
    }

    const elapsedMs = Date.now() - preStopStartTimeMs;
    const remainingMs = drainDurationMs - elapsedMs;

    if (currentWakeLockCount > 0) {
      const longestRunning = wakeLockDetails
        .map((lock) => ({
          ...lock,
          durationMs: Date.now() - lock.startTime,
        }))
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, PRESTOP_LOG_MAX_LOCKS);

      childLogger.info(
        {
          currentWakeLockCount,
          initialWakeLockCount,
          elapsedSeconds: Math.round(elapsedMs / 1000),
          remainingSeconds: Math.round(remainingMs / 1000),
          longestRunning: longestRunning.map((lock) => ({
            durationSeconds: Math.round(lock.durationMs / 1000),
            context: lock.context,
          })),
        },
        "Endpoint draining with active wake locks"
      );
    }

    await setTimeoutAsync(Math.min(PRESTOP_LOG_INTERVAL_MS, remainingMs));
  }

  const totalDurationMs = Date.now() - preStopStartTimeMs;
  const finalWakeLockDetails = getWakeLockDetails();

  if (finalWakeLockDetails.length === 0 && wakeLockIsFree()) {
    childLogger.info(
      { totalDurationMs },
      "Endpoint drain completed without active wake locks"
    );

    statsDMetrics.increment("prestop.wake_locks_cleared");
  } else {
    childLogger.warn(
      {
        activeWakeLocks: finalWakeLockDetails.map((lock) => ({
          context: lock.context,
          durationSeconds: Math.round((Date.now() - lock.startTime) / 1000),
          lockId: getLockShortId(lock),
        })),
        totalDurationMs,
      },
      "Endpoint drain deadline reached with active wake locks"
    );

    statsDMetrics.increment("prestop.timeouts");
    statsDMetrics.gauge(
      "prestop.timeout_wake_locks",
      finalWakeLockDetails.length
    );
    statsDMetrics.distribution("prestop.timeout_duration_ms", totalDurationMs);
    statsDMetrics.increment("prestop.wake_locks_forced");
    statsDMetrics.distribution(
      "prestop.wake_lock_forced_duration_ms",
      totalDurationMs
    );
  }

  childLogger.info(
    { totalDurationMs },
    "PreStop drain window complete. Process termination can proceed"
  );

  // Record total prestop duration.
  statsDMetrics.increment("prestop.completions");
  statsDMetrics.distribution("prestop.total_duration_ms", totalDurationMs);
}
