/**
 * Sandbox Pool Manager
 *
 * Simplified Redis-based pool management for Northflank sandboxes.
 * Uses Northflank as the source of truth for sandbox existence and metadata.
 *
 * Redis Keys:
 * - sandbox:sessions (Hash): sessionId → {serviceId, claimedAt}
 *
 * Source of Truth:
 * - Redis: Which sessions have claimed which sandboxes
 * - Northflank: What sandboxes exist, their metadata, their state
 */

import type { RedisClientType } from "redis";
import { createClient } from "redis";

import config from "@app/lib/api/config";
import {
  getNorthflankApiToken,
  NorthflankSandboxClient,
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

// Redis key - single hash for all session → sandbox mappings
const REDIS_KEYS = {
  sessions: "sandbox:sessions",
  replenishLock: "sandbox:pool:replenish",
} as const;

// Session claim stored in Redis
interface SessionClaim {
  serviceId: string;
  claimedAt: string; // ISO timestamp
}

// ============================================================================
// REDIS CLIENT
// ============================================================================

let poolRedisClient: RedisClientType | null = null;

async function getPoolRedis(): Promise<RedisClientType> {
  if (!poolRedisClient) {
    const uri = config.getSandboxPoolRedisUri();
    poolRedisClient = createClient({ url: uri }) as RedisClientType;

    poolRedisClient.on("error", (err) =>
      logger.info({ err }, "[sandbox-pool] Redis Client Error")
    );
    poolRedisClient.on("ready", () =>
      logger.info({}, "[sandbox-pool] Redis Client Ready")
    );

    await poolRedisClient.connect();
  }
  return poolRedisClient;
}

// ============================================================================
// POOL MANAGER
// ============================================================================

export class SandboxPoolManager {
  private config: PoolConfig;
  private client: NorthflankSandboxClient;

  constructor(configOverrides?: Partial<PoolConfig>) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...configOverrides };
    this.client = new NorthflankSandboxClient(getNorthflankApiToken());
  }

  /**
   * Acquire a sandbox for a session.
   * Returns an existing sandbox from pool (instant) or creates a new one.
   */
  async acquire(sessionId: string): Promise<NorthflankSandboxClient> {
    logger.info({ sessionId }, "[sandbox-pool] Acquiring sandbox");

    // 1. Check if session already has a sandbox
    const existingServiceId = await this.getSessionSandbox(sessionId);
    if (existingServiceId) {
      logger.info(
        { sessionId, serviceId: existingServiceId },
        "[sandbox-pool] Reusing existing session sandbox"
      );
      return this.attachToSandbox(existingServiceId);
    }

    // 2. List all sandboxes from Northflank
    const allSandboxes = await this.client.listPoolSandboxes();

    // 3. Get all claimed sandbox IDs from Redis (with stale session cleanup)
    const claimedIds = await this.getClaimedSandboxIds();

    // 4. Find an available one
    const available = allSandboxes.find((s) => !claimedIds.has(s.serviceId));

    if (available) {
      // 5. Atomically claim it (HSETNX returns true if set, false if already exists)
      const claimed = await this.claimSandbox(sessionId, available.serviceId);
      if (claimed) {
        logger.info(
          { sessionId, serviceId: available.serviceId },
          "[sandbox-pool] Acquired from pool (instant)"
        );

        // Trigger replenishment in background
        void this.triggerReplenish();

        return this.attachToSandbox(available.serviceId);
      }
      // Someone else claimed it, retry
      logger.info(
        { sessionId, serviceId: available.serviceId },
        "[sandbox-pool] Sandbox claimed by another session, retrying"
      );
      return this.acquire(sessionId);
    }

    // 6. No available sandbox - create new one (cold start)
    logger.info(
      { sessionId },
      "[sandbox-pool] Pool empty, cold start required"
    );

    const newClient = new NorthflankSandboxClient(getNorthflankApiToken());
    const info = await newClient.create();
    await this.claimSandbox(sessionId, info.serviceId);

    logger.info(
      { sessionId, serviceId: info.serviceId },
      "[sandbox-pool] Created and acquired (cold start)"
    );

    // Trigger replenishment in background
    void this.triggerReplenish();

    return newClient;
  }

  /**
   * Release a sandbox when session ends.
   * Destroys the sandbox for security (don't reuse user sandboxes).
   */
  async release(sessionId: string): Promise<void> {
    logger.info({ sessionId }, "[sandbox-pool] Releasing sandbox");

    const serviceId = await this.getSessionSandbox(sessionId);
    if (!serviceId) {
      logger.warn({ sessionId }, "[sandbox-pool] No sandbox to release");
      return;
    }

    // Remove from Redis
    await this.removeSessionClaim(sessionId);

    // Destroy the sandbox
    try {
      const client = this.attachToSandbox(serviceId);
      await client.destroy();

      logger.info(
        { sessionId, serviceId },
        "[sandbox-pool] Sandbox released and destroyed"
      );
    } catch (err) {
      logger.error(
        { sessionId, serviceId, err },
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
    const serviceId = await this.getSessionSandbox(sessionId);
    if (!serviceId) {
      return null;
    }
    return this.attachToSandbox(serviceId);
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

    const status = await this.getStatus();
    const needed = this.config.targetPoolSize - status.availableCount;

    if (needed <= 0) {
      logger.info(
        { currentSize: status.availableCount },
        "[sandbox-pool] Pool already at target size"
      );
      return;
    }

    logger.info({ needed }, "[sandbox-pool] Creating sandboxes for warmup");

    // Create sandboxes in parallel
    const promises = Array.from({ length: needed }, async () => {
      const client = new NorthflankSandboxClient(getNorthflankApiToken());
      await client.create();
      return client.getServiceId();
    });

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
    totalPoolSandboxes: number;
    claimedCount: number;
  }> {
    const allSandboxes = await this.client.listPoolSandboxes();
    const claimedIds = await this.getClaimedSandboxIds();

    const availableCount = allSandboxes.filter(
      (s) => !claimedIds.has(s.serviceId)
    ).length;

    return {
      availableCount,
      targetSize: this.config.targetPoolSize,
      totalPoolSandboxes: allSandboxes.length,
      claimedCount: claimedIds.size,
    };
  }

  /**
   * Shutdown and cleanup all sandboxes.
   */
  async shutdown(): Promise<void> {
    logger.info({}, "[sandbox-pool] Shutting down");

    // Get all pool sandboxes from Northflank
    const allSandboxes = await this.client.listPoolSandboxes();

    // Destroy them all
    await Promise.allSettled(
      allSandboxes.map(async (info) => {
        try {
          const client = this.attachToSandbox(info.serviceId);
          await client.destroy();
        } catch (err) {
          logger.warn(
            { serviceId: info.serviceId, err },
            "[sandbox-pool] Failed to destroy"
          );
        }
      })
    );

    // Clear all sessions from Redis
    const redis = await getPoolRedis();
    await redis.del(REDIS_KEYS.sessions);

    logger.info({}, "[sandbox-pool] Shutdown complete");
  }

  // --------------------------------------------------------------------------
  // Private: Redis Operations
  // --------------------------------------------------------------------------

  private async getSessionSandbox(sessionId: string): Promise<string | null> {
    const redis = await getPoolRedis();
    const claimJson = await redis.hGet(REDIS_KEYS.sessions, sessionId);

    if (!claimJson) {
      return null;
    }

    try {
      const claim = JSON.parse(claimJson) as SessionClaim;

      // Check if the claim is stale
      const claimedAt = new Date(claim.claimedAt).getTime();
      if (Date.now() - claimedAt > this.config.maxSessionDurationMs) {
        // Stale claim - clean it up
        logger.info(
          { sessionId, serviceId: claim.serviceId },
          "[sandbox-pool] Cleaning up stale session claim"
        );
        await this.removeSessionClaim(sessionId);
        return null;
      }

      return claim.serviceId;
    } catch {
      // Invalid JSON, clean up
      await redis.hDel(REDIS_KEYS.sessions, sessionId);
      return null;
    }
  }

  private async getClaimedSandboxIds(): Promise<Set<string>> {
    const redis = await getPoolRedis();
    const allClaims = await redis.hGetAll(REDIS_KEYS.sessions);

    const now = Date.now();
    const validServiceIds = new Set<string>();
    const staleSessions: string[] = [];

    for (const [sessionId, claimJson] of Object.entries(allClaims)) {
      try {
        const claim = JSON.parse(claimJson) as SessionClaim;
        const claimedAt = new Date(claim.claimedAt).getTime();

        if (now - claimedAt > this.config.maxSessionDurationMs) {
          // Stale claim
          staleSessions.push(sessionId);
        } else {
          validServiceIds.add(claim.serviceId);
        }
      } catch {
        // Invalid JSON, mark for cleanup
        staleSessions.push(sessionId);
      }
    }

    // Clean up stale sessions
    if (staleSessions.length > 0) {
      logger.info(
        { count: staleSessions.length },
        "[sandbox-pool] Cleaning up stale session claims"
      );
      await redis.hDel(REDIS_KEYS.sessions, staleSessions);
    }

    return validServiceIds;
  }

  private async claimSandbox(
    sessionId: string,
    serviceId: string
  ): Promise<boolean> {
    const redis = await getPoolRedis();

    const claim: SessionClaim = {
      serviceId,
      claimedAt: new Date().toISOString(),
    };

    // HSETNX is atomic - returns true if set, false if key already existed
    const result = await redis.hSetNX(
      REDIS_KEYS.sessions,
      sessionId,
      JSON.stringify(claim)
    );

    return result;
  }

  private async removeSessionClaim(sessionId: string): Promise<void> {
    const redis = await getPoolRedis();
    await redis.hDel(REDIS_KEYS.sessions, sessionId);
  }

  // --------------------------------------------------------------------------
  // Private: Helpers
  // --------------------------------------------------------------------------

  private attachToSandbox(serviceId: string): NorthflankSandboxClient {
    const client = new NorthflankSandboxClient(getNorthflankApiToken());
    client.attach({
      serviceId,
      projectId: config.getNorthflankProjectId() ?? "dust-sandbox-dev",
      createdAt: new Date(), // We don't have the exact time, but it's not critical
    });
    return client;
  }

  // --------------------------------------------------------------------------
  // Private: Pool Replenishment
  // --------------------------------------------------------------------------

  private async triggerReplenish(): Promise<void> {
    // Use distributed lock to ensure only one replica replenishes at a time
    try {
      await executeWithLock(
        REDIS_KEYS.replenishLock,
        async () => {
          const status = await this.getStatus();
          const needed = this.config.targetPoolSize - status.availableCount;

          if (needed <= 0) {
            return;
          }

          logger.info({ needed }, "[sandbox-pool] Replenishing pool");

          // Create sandboxes one at a time to avoid overwhelming the API
          for (let i = 0; i < needed; i++) {
            try {
              const client = new NorthflankSandboxClient(
                getNorthflankApiToken()
              );
              await client.create();
              logger.info(
                { serviceId: client.getServiceId() },
                "[sandbox-pool] Added to pool"
              );
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
  poolManager ??= new SandboxPoolManager();
  return poolManager;
}
