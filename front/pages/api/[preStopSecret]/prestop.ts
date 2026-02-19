import {
  PRESTOP_GRACE_PERIOD_MS,
  PRESTOP_LB_PROPAGATION_MS,
  PRESTOP_MIN_DRAINING_WAIT_MS,
  PRESTOP_WAKE_LOCK_MAX_WAIT_MS,
} from "@app/lib/constants/timeouts";
import { markShuttingDown } from "@app/lib/shutdown_signal";
import { setTimeoutAsync } from "@app/lib/utils/async_utils";
import type { WakeLockEntry } from "@app/lib/wake_lock";
import { getWakeLockDetails, wakeLockIsFree } from "@app/lib/wake_lock";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import { withLogging } from "@app/logger/withlogging";
import type { NextApiRequest, NextApiResponse } from "next";

const PRESTOP_LOG_INTERVAL_MS = 1000; // 1 second log interval.
const PRESTOP_LOG_MAX_LOCKS = 3; // Show top 3 longest running wake locks.

function getLockShortId(lock: WakeLockEntry): string {
  return lock.id.substring(0, 8);
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  const { preStopSecret } = req.query;
  const { PRESTOP_SECRET } = process.env;
  if (!PRESTOP_SECRET) {
    logger.error("PRESTOP_SECRET is not defined");
  }

  if (
    req.method !== "POST" ||
    !PRESTOP_SECRET ||
    preStopSecret !== PRESTOP_SECRET
  ) {
    res.status(404).end();
    return;
  }

  const childLogger = logger.child({
    action: "preStop",
  });

  // Record pre-stop initiation.
  statsDClient.increment("prestop.requests");

  // Phase 1: Signal shutdown immediately to fail readiness probe.
  // This triggers the load balancer to stop sending new connections.
  markShuttingDown();
  childLogger.info("Shutdown initiated, readiness probe will now fail");

  // Phase 2: Wait for load balancer to propagate readiness=false.
  childLogger.info(
    { propagationMs: PRESTOP_LB_PROPAGATION_MS },
    "Waiting for load balancer propagation"
  );
  await setTimeoutAsync(PRESTOP_LB_PROPAGATION_MS);

  // Phase 3: Wait for wake locks (critical operations), max 120s.
  const wakeLockStartTime = Date.now();
  let initialWakeLockCount: number | null = null;

  while (!wakeLockIsFree()) {
    const wakeLockDetails = getWakeLockDetails();
    const currentWakeLockCount = wakeLockDetails.length;

    if (initialWakeLockCount === null) {
      initialWakeLockCount = currentWakeLockCount;
      childLogger.info(
        { wakeLockCount: currentWakeLockCount },
        "Starting to wait for wake locks to be free"
      );

      // Record initial wake lock metrics.
      statsDClient.gauge("prestop.initial_wake_locks", currentWakeLockCount);
      if (currentWakeLockCount > 0) {
        statsDClient.increment("prestop.has_wake_locks");
      } else {
        statsDClient.increment("prestop.no_wake_locks");
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

    const elapsedMs = Date.now() - wakeLockStartTime;
    const remainingMs = PRESTOP_WAKE_LOCK_MAX_WAIT_MS - elapsedMs;

    // Show progress of longest-running wake locks.
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
      "Waiting for wake locks to be free"
    );

    // Safety timeout to avoid exceeding grace period.
    if (elapsedMs >= PRESTOP_WAKE_LOCK_MAX_WAIT_MS) {
      childLogger.warn(
        {
          timeoutMs: PRESTOP_WAKE_LOCK_MAX_WAIT_MS,
          currentWakeLockCount,
          graceSecondsRemaining: Math.round(
            (PRESTOP_GRACE_PERIOD_MS - PRESTOP_LB_PROPAGATION_MS - elapsedMs) /
              1000
          ),
          activeWakeLocks: wakeLockDetails.map((lock) => ({
            context: lock.context,
            durationSeconds: Math.round((Date.now() - lock.startTime) / 1000),
            lockId: getLockShortId(lock),
          })),
        },
        "Pre-stop wake lock timeout reached, terminating with active wake locks"
      );

      // Record timeout metrics.
      statsDClient.increment("prestop.timeouts");
      statsDClient.gauge("prestop.timeout_wake_locks", currentWakeLockCount);
      statsDClient.distribution("prestop.timeout_duration_ms", elapsedMs);

      break;
    }

    await setTimeoutAsync(PRESTOP_LOG_INTERVAL_MS);
  }

  const wakeLockDurationMs = Date.now() - wakeLockStartTime;

  if (wakeLockIsFree()) {
    childLogger.info(
      {
        wakeLockDurationMs,
        wakeLockDurationSeconds: Math.round(wakeLockDurationMs / 1000),
      },
      "All wake locks cleared successfully"
    );

    // Record successful completion metrics.
    statsDClient.increment("prestop.wake_locks_cleared");
    statsDClient.distribution(
      "prestop.wake_lock_duration_ms",
      wakeLockDurationMs
    );
  } else {
    // Record forced termination metrics.
    statsDClient.increment("prestop.wake_locks_forced");
    statsDClient.distribution(
      "prestop.wake_lock_forced_duration_ms",
      wakeLockDurationMs
    );
  }

  // Phase 4: Ensure we wait at least 60s total for connection draining.
  // This allows existing SSE connections and HTTP requests to complete gracefully.
  // Wait for MAX(wakeLockDuration, 60s).
  const remainingDrainingWaitMs = Math.max(
    0,
    PRESTOP_MIN_DRAINING_WAIT_MS - wakeLockDurationMs
  );

  if (remainingDrainingWaitMs > 0) {
    childLogger.info(
      {
        wakeLockDurationMs,
        additionalDrainingWaitMs: remainingDrainingWaitMs,
        totalDrainingTimeMs: PRESTOP_MIN_DRAINING_WAIT_MS,
      },
      "Waiting additional time for connection draining"
    );

    statsDClient.increment("prestop.draining_wait_additional");
    statsDClient.distribution(
      "prestop.draining_additional_wait_ms",
      remainingDrainingWaitMs
    );

    await setTimeoutAsync(remainingDrainingWaitMs);
  } else {
    childLogger.info(
      {
        wakeLockDurationMs,
        drainingRequirementMet: true,
      },
      "Connection draining period already satisfied by wake lock wait"
    );

    statsDClient.increment("prestop.draining_wait_satisfied_by_wake_locks");
  }

  const totalDurationMs =
    PRESTOP_LB_PROPAGATION_MS +
    Math.max(wakeLockDurationMs, PRESTOP_MIN_DRAINING_WAIT_MS);

  childLogger.info(
    {
      totalDurationMs,
      totalDurationSeconds: Math.round(totalDurationMs / 1000),
      phaseLbPropagationMs: PRESTOP_LB_PROPAGATION_MS,
      phaseWakeLockMs: wakeLockDurationMs,
      phaseDrainingWaitMs: Math.max(
        wakeLockDurationMs,
        PRESTOP_MIN_DRAINING_WAIT_MS
      ),
    },
    "PreStop complete, process can now exit"
  );

  // Record total prestop duration.
  statsDClient.increment("prestop.completions");
  statsDClient.distribution("prestop.total_duration_ms", totalDurationMs);

  res.status(200).end();
}

export default withLogging(handler);
