import type { Server } from "http";
import { CONFIG } from "./config.js";

export class GracefulServer {
  private isShuttingDown = false;
  private listeners: Map<string, (...args: any[]) => void> = new Map();

  constructor(private server: Server) {
    this.setupShutdownHandlers();
  }

  isHealthy(): boolean {
    return !this.isShuttingDown;
  }

  private setupShutdownHandlers(): void {
    const sigtermHandler = () => this.gracefulShutdown("SIGTERM");
    const sigintHandler = () => this.gracefulShutdown("SIGINT");
    const uncaughtExceptionHandler = (error: Error) => {
      console.error("Uncaught exception occurred", {
        component: "server",
        error: error.message,
        stack: error.stack,
      });
      this.gracefulShutdown("uncaughtException");
    };
    const unhandledRejectionHandler = (
      reason: unknown,
      promise: Promise<unknown>
    ) => {
      console.error("Unhandled promise rejection", {
        component: "server",
        reason: String(reason),
        promise: String(promise),
      });
      this.gracefulShutdown("unhandledRejection");
    };

    process.on("SIGTERM", sigtermHandler);
    process.on("SIGINT", sigintHandler);
    process.on("uncaughtException", uncaughtExceptionHandler);
    process.on("unhandledRejection", unhandledRejectionHandler);

    this.listeners.set("SIGTERM", sigtermHandler);
    this.listeners.set("SIGINT", sigintHandler);
    this.listeners.set("uncaughtException", uncaughtExceptionHandler);
    this.listeners.set("unhandledRejection", unhandledRejectionHandler);
  }

  dispose(): void {
    for (const [event, listener] of this.listeners) {
      process.removeListener(event as any, listener);
    }
    this.listeners.clear();
  }

  private gracefulShutdown(signal: string): void {
    console.log("Starting graceful shutdown", {
      component: "server",
      signal,
      timeout: CONFIG.SHUTDOWN_TIMEOUT_MS,
    });
    this.isShuttingDown = true;

    this.dispose();

    this.server.close((err) => {
      if (err) {
        console.error("Error during server close", {
          component: "server",
          error: err.message,
        });
        process.exit(1);
      }
      console.log("Server closed gracefully", { component: "server" });
      process.exit(0);
    });

    setTimeout(() => {
      console.error("Forced shutdown after timeout", {
        component: "server",
        timeout: CONFIG.SHUTDOWN_TIMEOUT_MS,
      });
      process.exit(1);
    }, CONFIG.SHUTDOWN_TIMEOUT_MS);
  }
}
