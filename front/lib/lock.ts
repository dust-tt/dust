import { uuid4 } from "@temporalio/workflow";
import crypto from "crypto";

import logger from "@app/logger/logger";

import { front_sequelize } from "./databases";

function lockKeyToHash(lockKey: string): number {
  const hash = crypto.createHash("md5").update(lockKey).digest("hex");
  const lockKeyHashed = parseInt(hash, 16) % 9999999999;

  return lockKeyHashed;
}

export async function distributedLock(lockKey: string) {
  const uid = uuid4();
  const now = new Date();

  const lockKeyHashed = lockKeyToHash(lockKey);
  logger.info(
    {
      lockKey,
      uid,
      lockKeyHashed,
    },
    "[DISTRIBUTED_LOCK] Acquiring advisory lock"
  );
  await front_sequelize.query("SELECT pg_advisory_lock(:key)", {
    replacements: { key: lockKeyHashed },
  });

  logger.info(
    {
      duration: new Date().getTime() - now.getTime(),
      lockKeyHashed,
      lockKey,
      uid,
    },
    "[DISTRIBUTED_LOCK] Advisory lock acquired"
  );

  return async () => {
    await distributedLockRelease(lockKey, uid);
  };
}

export async function distributedLockRelease(
  lockKey: string,
  uid: string | undefined
) {
  const lockKeyHashed = lockKeyToHash(lockKey);
  logger.info(
    {
      lockKey,
      uid,
      lockKeyHashed,
    },
    "[DISTRIBUTED_LOCK] Releasing advisory lock"
  );
  await front_sequelize.query("SELECT pg_advisory_unlock(:key)", {
    replacements: { key: lockKeyHashed },
  });
}
