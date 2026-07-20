import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { isErrnoException } from "./errors";
import { getLifecycleLockPath } from "./paths";
import { isProcessRunning } from "./process";

const LOCK_OWNER_FILE = "owner.json";
const INCOMPLETE_LOCK_GRACE_MS = 5_000;

const LockOwnerSchema = z.object({
  pid: z.number().int().positive(),
  token: z.string(),
});

type LockOwner = z.infer<typeof LockOwnerSchema>;

export interface LifecycleLock {
  release: () => Promise<void>;
}

async function removeAbandonedLock(lockPath: string): Promise<boolean> {
  const ownerFile = Bun.file(join(lockPath, LOCK_OWNER_FILE));
  if (await ownerFile.exists()) {
    try {
      const owner: unknown = await ownerFile.json();
      const parsed = LockOwnerSchema.safeParse(owner);
      if (parsed.success && isProcessRunning(parsed.data.pid)) {
        return false;
      }
      await rm(lockPath, { recursive: true, force: true });
      return true;
    } catch {
      // A partially written owner file is handled by the grace period below.
    }
  }

  try {
    const info = await stat(lockPath);
    if (Date.now() - info.mtimeMs < INCOMPLETE_LOCK_GRACE_MS) {
      return false;
    }
    await rm(lockPath, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return true;
    }
    throw error;
  }
}

export async function acquireLifecycleLock(
  envName: string,
  options: { wait?: boolean } = {}
): Promise<LifecycleLock | null> {
  const lockPath = getLifecycleLockPath(envName);
  const token = crypto.randomUUID();

  while (true) {
    try {
      await mkdir(lockPath);
      const owner: LockOwner = { pid: process.pid, token };
      try {
        await Bun.write(join(lockPath, LOCK_OWNER_FILE), JSON.stringify(owner));
      } catch (error) {
        await rm(lockPath, { recursive: true, force: true });
        throw error;
      }

      return {
        release: async () => {
          const ownerFile = Bun.file(join(lockPath, LOCK_OWNER_FILE));
          if (!(await ownerFile.exists())) {
            return;
          }
          const currentOwner: unknown = await ownerFile.json();
          const parsed = LockOwnerSchema.safeParse(currentOwner);
          if (parsed.success && parsed.data.token === token) {
            await rm(lockPath, { recursive: true, force: true });
          }
        },
      };
    } catch (error) {
      if (!isErrnoException(error) || error.code !== "EEXIST") {
        throw error;
      }
      if (await removeAbandonedLock(lockPath)) {
        continue;
      }
      if (!options.wait) {
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}
