import logger from "@app/logger/logger";

let isShuttingDown = false;

/**
 * Sets up graceful shutdown handlers for SIGTERM and SIGINT signals.
 *
 * This prevents Next.js from immediately closing the HTTP server when receiving SIGTERM. Instead,
 * we control the shutdown sequence ourselves.
 *
 * Important: This works in conjunction with the Kubernetes preStop hook.
 * The preStop hook (which calls /api/prestop) handles:
 * - Waiting 10s for load balancer propagation
 * - Waiting for wake locks (in-flight operations) to clear
 *
 * Only after preStop completes does Kubernetes send SIGTERM to this handler.
 * By that point, all operations are done, so we just exit immediately.
 *
 * Without this handler, the Next.js process would sit idle for the full
 * terminationGracePeriodSeconds (130s) after the HTTP server closes, wasting resources.
 *
 * Requires: NEXT_MANUAL_SIG_HANDLE=true environment variable
 */
export function setupGracefulShutdown() {
  if (process.env.NEXT_MANUAL_SIG_HANDLE !== "true") {
    return;
  }

  const gracefulShutdown: NodeJS.SignalsListener = async (signal) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    const childLogger = logger.child({ action: "gracefulShutdown" });
    childLogger.info({ signal }, "Starting graceful shutdown");

    process.exit(0);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}
