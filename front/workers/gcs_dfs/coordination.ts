import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { RedisClientType } from "@app/lib/api/redis";

export const OWNERSHIP_LEASE_MS = 60_000;
const RENEW_INTERVAL_MS = OWNERSHIP_LEASE_MS / 3;

const OWNERSHIP_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local key = KEYS[1]
local action = ARGV[1]
local owner = ARGV[2]
local lease = tonumber(ARGV[3])
if action == 'claim' then
  local untilMs = tonumber(redis.call('HGET', key, 'untilMs') or '0')
  if untilMs > now then return {0, ''} end
  local session = redis.call('HGET', key, 'session') or ''
  redis.call('HSET', key, 'owner', owner, 'untilMs', now + lease)
  return {1, session}
end
if redis.call('HGET', key, 'owner') ~= owner then return 0 end
if action == 'release' then
  if not redis.call('HGET', key, 'session') then return redis.call('DEL', key) end
  redis.call('HSET', key, 'untilMs', 0)
  return 1
end
if action == 'clear' then return redis.call('HDEL', key, 'session') end
if tonumber(redis.call('HGET', key, 'untilMs') or '0') <= now then return 0 end
if action == 'register' then redis.call('HSET', key, 'session', ARGV[4]) end
redis.call('HSET', key, 'untilMs', now + lease)
return 1
`;

export class OwnershipError extends Error {
  constructor(readonly reason: "object_busy" | "ownership_lost") {
    super(reason);
  }
}

export interface ImportOwnership {
  previousSession: string;
  register(sessionId: string): Promise<void>;
  assert(): Promise<void>;
  clearRevokedSession(): Promise<void>;
}

export interface ImportCoordinator {
  withOwnership<T>(
    key: string,
    run: (ownership: ImportOwnership) => Promise<T>
  ): Promise<T>;
}

export class RedisImportCoordinator implements ImportCoordinator {
  constructor(private readonly redis: Pick<RedisClientType, "eval">) {}

  async withOwnership<T>(
    key: string,
    run: (ownership: ImportOwnership) => Promise<T>
  ): Promise<T> {
    const owner = randomUUID();
    const execute = (action: string, session = "") =>
      this.redis.eval(OWNERSHIP_SCRIPT, {
        keys: [`gcs-dfs:ownership:v1:${key}`],
        arguments: [action, owner, String(OWNERSHIP_LEASE_MS), session],
      });
    const [claimed, previousSession] = z
      .tuple([z.number(), z.string()])
      .parse(await execute("claim"));
    if (claimed !== 1) {
      throw new OwnershipError("object_busy");
    }
    let lost = false;
    let renewing: Promise<void> | undefined;
    const renew = async (action = "renew", session = "") => {
      if (lost) {
        throw new OwnershipError("ownership_lost");
      }
      try {
        if ((await execute(action, session)) !== 1) {
          throw new OwnershipError("ownership_lost");
        }
      } catch (error) {
        lost = true;
        throw error;
      }
    };
    const timer = setInterval(() => {
      renewing ??= renew()
        .catch(() => {
          lost = true;
        })
        .finally(() => {
          renewing = undefined;
        });
    }, RENEW_INTERVAL_MS);
    try {
      return await run({
        previousSession,
        register: (id) => renew("register", id),
        assert: () => renew(),
        clearRevokedSession: async () => {
          await execute("clear");
        },
      });
    } finally {
      clearInterval(timer);
      await renewing;
      await execute("release");
    }
  }
}
