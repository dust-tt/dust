/**
 * Sandbox Pool Manager
 *
 * Redis-based pool management for Northflank sandboxes.
 * Designed for stateless front replicas with distributed coordination.
 *
 * Redis Keys:
 * - sandbox:pool:available - List of available sandbox service IDs
 * - sandbox:session:{sessionId} - Hash with sandbox info for a session
 * - sandbox:info:{serviceId} - Hash with sandbox metadata
 */

import { getRedisClient, runOnRedis } from "@app/lib/api/redis";
import {
  getNorthflankApiToken,
  NorthflankSandboxClient,
  type SandboxInfo,
} from "@app/lib/api/sandbox/client";
import { executeWithLock } from "@app/lib/lock";
import logger from "@app/logger/logger";

// ============================================================================
// CONFIGURATION
// ============================================================================

interface PoolConfig {
  // Target number of warm sandboxes in the pool
  targetPoolSize: number;
  // Maximum time a sandbox can be assigned to a session (auto-release)
  maxSessionDurationMs: number;
  // How long to wait for a sandbox to become available
  acquireTimeoutMs: number;
}

const DEFAULT_POOL_CONFIG: PoolConfig = {
  targetPoolSize: 3,
  maxSessionDurationMs: 30 * 60 * 1000, // 30 minutes
  acquireTimeoutMs: 120000, // 2 minutes (for cold start)
};

// Redis key prefixes
const REDIS_KEYS = {
  availablePool: "sandbox:pool:available",
  sessionPrefix: "sandbox:session:",
  infoPrefix: "sandbox:info:",
  replenishLock: "sandbox:pool:replenish",
} as const;

// ============================================================================
// POOL MANAGER
// ============================================================================

export class SandboxPoolManager {
  private config: PoolConfig;

  constructor(configOverrides?: Partial<PoolConfig>) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...configOverrides };
  }

  /**
   * Acquire a sandbox for a session.
   * Returns an existing sandbox from pool (instant) or creates a new one.
   */
  async acquire(sessionId: string): Promise<NorthflankSandboxClient> {
    logger.info({ sessionId }, "[sandbox-pool] Acquiring sandbox");

    // Check if session already has a sandbox
    const existingInfo = await this.getSessionSandbox(sessionId);
    if (existingInfo) {
      logger.info(
        { sessionId, serviceId: existingInfo.serviceId },
        "[sandbox-pool] Reusing existing session sandbox"
      );
      const client = new NorthflankSandboxClient(getNorthflankApiToken());
      client.attach(existingInfo);
      return client;
    }

    // Try to get a sandbox from the pool
    const pooledInfo = await this.popFromPool();
    if (pooledInfo) {
      // Assign to session
      await this.assignToSession(sessionId, pooledInfo);

      logger.info(
        { sessionId, serviceId: pooledInfo.serviceId },
        "[sandbox-pool] Acquired from pool (instant)"
      );

      // Trigger replenishment in background (don't await)
      void this.triggerReplenish();

      const client = new NorthflankSandboxClient(getNorthflankApiToken());
      client.attach(pooledInfo);
      return client;
    }

    // No sandbox available - create on demand (cold start)
    logger.info(
      { sessionId },
      "[sandbox-pool] Pool empty, cold start required"
    );

    const client = new NorthflankSandboxClient(getNorthflankApiToken());
    const info = await client.create();

    // Assign to session
    await this.assignToSession(sessionId, info);

    logger.info(
      { sessionId, serviceId: info.serviceId },
      "[sandbox-pool] Created and acquired (cold start)"
    );

    // Trigger replenishment in background
    void this.triggerReplenish();

    return client;
  }

  /**
   * Release a sandbox when session ends.
   * Destroys the sandbox for security (don't reuse user sandboxes).
   */
  async release(sessionId: string): Promise<void> {
    logger.info({ sessionId }, "[sandbox-pool] Releasing sandbox");

    const info = await this.getSessionSandbox(sessionId);
    if (!info) {
      logger.warn({ sessionId }, "[sandbox-pool] No sandbox to release");
      return;
    }

    // Remove from session
    await this.removeFromSession(sessionId);

    // Destroy the sandbox (don't reuse for security)
    try {
      const client = new NorthflankSandboxClient(getNorthflankApiToken());
      client.attach(info);
      await client.destroy();

      // Remove info from Redis
      await this.removeSandboxInfo(info.serviceId);

      logger.info(
        { sessionId, serviceId: info.serviceId },
        "[sandbox-pool] Sandbox released and destroyed"
      );
    } catch (err) {
      logger.error(
        { sessionId, serviceId: info.serviceId, err },
        "[sandbox-pool] Failed to destroy sandbox"
      );
    }

    // Trigger replenishment
    void this.triggerReplenish();
  }

  /**
   * Get the sandbox client for an existing session (if any).
   */
  async getForSession(
    sessionId: string
  ): Promise<NorthflankSandboxClient | null> {
    const info = await this.getSessionSandbox(sessionId);
    if (!info) {
      return null;
    }

    const client = new NorthflankSandboxClient(getNorthflankApiToken());
    client.attach(info);
    return client;
  }

  /**
   * Warm up the pool with sandboxes.
   * Called at startup or when pool is depleted.
   */
  async warmUp(): Promise<void> {
    logger.info(
      { targetSize: this.config.targetPoolSize },
      "[sandbox-pool] Warming up pool"
    );

    const currentSize = await this.getPoolSize();
    const needed = this.config.targetPoolSize - currentSize;

    if (needed <= 0) {
      logger.info(
        { currentSize },
        "[sandbox-pool] Pool already at target size"
      );
      return;
    }

    logger.info({ needed }, "[sandbox-pool] Creating sandboxes for warmup");

    // Create sandboxes in parallel
    const promises = Array.from({ length: needed }, () =>
      this.createAndAddToPool()
    );

    const results = await Promise.allSettled(promises);
    const succeeded = results.filter((r) => r.status === "fulfilled").length;

    logger.info(
      { succeeded, failed: needed - succeeded },
      "[sandbox-pool] Warmup complete"
    );
  }

  /**
   * Get pool status.
   */
  async getStatus(): Promise<{
    availableCount: number;
    targetSize: number;
  }> {
    const availableCount = await this.getPoolSize();
    return {
      availableCount,
      targetSize: this.config.targetPoolSize,
    };
  }

  /**
   * Shutdown and cleanup all sandboxes.
   */
  async shutdown(): Promise<void> {
    logger.info({}, "[sandbox-pool] Shutting down");

    // Get all available sandboxes
    const serviceIds = await this.drainPool();

    // Destroy them all
    await Promise.allSettled(
      serviceIds.map(async (serviceId) => {
        try {
          const info = await this.getSandboxInfo(serviceId);
          if (info) {
            const client = new NorthflankSandboxClient(getNorthflankApiToken());
            client.attach(info);
            await client.destroy();
            await this.removeSandboxInfo(serviceId);
          }
        } catch (err) {
          logger.warn({ serviceId, err }, "[sandbox-pool] Failed to destroy");
        }
      })
    );

    logger.info({}, "[sandbox-pool] Shutdown complete");
  }

  // --------------------------------------------------------------------------
  // Private: Redis Operations
  // --------------------------------------------------------------------------

  private async popFromPool(): Promise<SandboxInfo | null> {
    return runOnRedis({ origin: "sandbox_pool" }, async (client) => {
      // Pop from the available pool
      const serviceId = await client.lPop(REDIS_KEYS.availablePool);
      if (!serviceId) {
        return null;
      }

      // Get sandbox info
      const info = await this.getSandboxInfo(serviceId);
      if (!info) {
        logger.warn({ serviceId }, "[sandbox-pool] Sandbox info not found");
        return null;
      }

      return info;
    });
  }

  private async addToPool(info: SandboxInfo): Promise<void> {
    await runOnRedis({ origin: "sandbox_pool" }, async (client) => {
      // Store sandbox info
      await client.hSet(REDIS_KEYS.infoPrefix + info.serviceId, {
        serviceId: info.serviceId,
        projectId: info.projectId,
        createdAt: info.createdAt.toISOString(),
      });

      // Add to available pool
      await client.rPush(REDIS_KEYS.availablePool, info.serviceId);
    });
  }

  private async getPoolSize(): Promise<number> {
    return runOnRedis({ origin: "sandbox_pool" }, async (client) => {
      return client.lLen(REDIS_KEYS.availablePool);
    });
  }

  private async drainPool(): Promise<string[]> {
    return runOnRedis({ origin: "sandbox_pool" }, async (client) => {
      const serviceIds: string[] = [];
      let serviceId: string | null;
      while ((serviceId = await client.lPop(REDIS_KEYS.availablePool))) {
        serviceIds.push(serviceId);
      }
      return serviceIds;
    });
  }

  private async getSandboxInfo(serviceId: string): Promise<SandboxInfo | null> {
    return runOnRedis({ origin: "sandbox_pool" }, async (client) => {
      const data = await client.hGetAll(REDIS_KEYS.infoPrefix + serviceId);
      if (!data.serviceId) {
        return null;
      }
      return {
        serviceId: data.serviceId,
        projectId: data.projectId,
        createdAt: new Date(data.createdAt),
      };
    });
  }

  private async removeSandboxInfo(serviceId: string): Promise<void> {
    await runOnRedis({ origin: "sandbox_pool" }, async (client) => {
      await client.del(REDIS_KEYS.infoPrefix + serviceId);
    });
  }

  private async assignToSession(
    sessionId: string,
    info: SandboxInfo
  ): Promise<void> {
    await runOnRedis({ origin: "sandbox_pool" }, async (client) => {
      await client.hSet(REDIS_KEYS.sessionPrefix + sessionId, {
        serviceId: info.serviceId,
        projectId: info.projectId,
        createdAt: info.createdAt.toISOString(),
        assignedAt: new Date().toISOString(),
      });

      // Set TTL for auto-cleanup
      await client.expire(
        REDIS_KEYS.sessionPrefix + sessionId,
        Math.floor(this.config.maxSessionDurationMs / 1000)
      );
    });
  }

  private async getSessionSandbox(
    sessionId: string
  ): Promise<SandboxInfo | null> {
    return runOnRedis({ origin: "sandbox_pool" }, async (client) => {
      const data = await client.hGetAll(REDIS_KEYS.sessionPrefix + sessionId);
      if (!data.serviceId) {
        return null;
      }
      return {
        serviceId: data.serviceId,
        projectId: data.projectId,
        createdAt: new Date(data.createdAt),
      };
    });
  }

  private async removeFromSession(sessionId: string): Promise<void> {
    await runOnRedis({ origin: "sandbox_pool" }, async (client) => {
      await client.del(REDIS_KEYS.sessionPrefix + sessionId);
    });
  }

  // --------------------------------------------------------------------------
  // Private: Pool Replenishment
  // --------------------------------------------------------------------------

  private async createAndAddToPool(): Promise<void> {
    const client = new NorthflankSandboxClient(getNorthflankApiToken());
    const info = await client.create();
    await this.addToPool(info);
    logger.info({ serviceId: info.serviceId }, "[sandbox-pool] Added to pool");
  }

  private async triggerReplenish(): Promise<void> {
    // Use distributed lock to ensure only one replica replenishes at a time
    try {
      await executeWithLock(
        REDIS_KEYS.replenishLock,
        async () => {
          const currentSize = await this.getPoolSize();
          const needed = this.config.targetPoolSize - currentSize;

          if (needed <= 0) {
            return;
          }

          logger.info({ needed }, "[sandbox-pool] Replenishing pool");

          // Create sandboxes one at a time to avoid overwhelming the API
          for (let i = 0; i < needed; i++) {
            try {
              await this.createAndAddToPool();
            } catch (err) {
              logger.error(
                { err, iteration: i + 1, needed },
                "[sandbox-pool] Failed to create sandbox for replenishment"
              );
              // Continue trying to create more
            }
          }
        },
        60000 // 60 second timeout for replenishment
      );
    } catch (err) {
      // Lock acquisition failed - another replica is already replenishing
      logger.debug(
        { err },
        "[sandbox-pool] Replenishment skipped (another replica handling)"
      );
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let poolManager: SandboxPoolManager | null = null;

export function getSandboxPoolManager(): SandboxPoolManager {
  if (!poolManager) {
    poolManager = new SandboxPoolManager();
  }
  return poolManager;
}
