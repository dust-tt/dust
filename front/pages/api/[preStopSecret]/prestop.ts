import type { NextApiRequest, NextApiResponse } from "next";

import { PRESTOP_GRACE_PERIOD_MS } from "@app/lib/constants/timeouts";
import { setTimeoutAsync } from "@app/lib/utils/async_utils";
import type { WakeLockEntry } from "@app/lib/wake_lock";
import { getWakeLockDetails, wakeLockIsFree } from "@app/lib/wake_lock";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import { withLogging } from "@app/logger/withlogging";

const PRESTOP_MAX_WAIT_MS = 120 * 1000; // 120 seconds max wait.
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

  childLogger.info("Received prestop request, waiting 10s");

  // Record pre-stop initiation.
  statsDClient.increment("prestop.requests");

  await setTimeoutAsync(10000);

  const preStopStartTime = Date.now();
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

    const elapsedMs = Date.now() - preStopStartTime;
    const remainingMs = PRESTOP_MAX_WAIT_MS - elapsedMs;

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
    if (elapsedMs >= PRESTOP_MAX_WAIT_MS) {
      childLogger.warn(
        {
          timeoutMs: PRESTOP_MAX_WAIT_MS,
          currentWakeLockCount,
          graceSecondsRemaining: Math.round(
            (PRESTOP_GRACE_PERIOD_MS - elapsedMs) / 1000
          ),
          activeWakeLocks: wakeLockDetails.map((lock) => ({
            context: lock.context,
            durationSeconds: Math.round((Date.now() - lock.startTime) / 1000),
            lockId: getLockShortId(lock),
          })),
        },
        "Pre-stop timeout reached, terminating with active wake locks"
      );

      // Record timeout metrics.
      statsDClient.increment("prestop.timeouts");
      statsDClient.gauge("prestop.timeout_wake_locks", currentWakeLockCount);
      statsDClient.distribution("prestop.timeout_duration_ms", elapsedMs);

      break;
    }

    await setTimeoutAsync(PRESTOP_LOG_INTERVAL_MS);
  }

  const totalWaitMs = Date.now() - preStopStartTime;

  if (wakeLockIsFree()) {
    childLogger.info(
      {
        totalWaitSeconds: Math.round(totalWaitMs / 1000),
      },
      "All wake locks cleared successfully"
    );

    // Record successful completion metrics.
    statsDClient.increment("prestop.completions");
    statsDClient.distribution("prestop.wait_duration_ms", totalWaitMs);
  } else {
    // Record forced termination metrics.
    statsDClient.increment("prestop.forced_terminations");
    statsDClient.distribution("prestop.forced_duration_ms", totalWaitMs);
  }

  res.status(200).end();
}

export default withLogging(handler);
