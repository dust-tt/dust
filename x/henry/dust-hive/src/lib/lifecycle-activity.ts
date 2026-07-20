import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { isErrnoException } from "./errors";
import { acquireLifecycleLock } from "./lifecycle-lock";
import { getLifecycleActivityPath, getLifecycleLeaseDir, getLifecycleLeasePath } from "./paths";
import { isProcessRunning } from "./process";

export const LIFECYCLE_ACTIVITY_KINDS = ["command", "frontend", "test"] as const;
export type LifecycleActivityKind = (typeof LIFECYCLE_ACTIVITY_KINDS)[number];

const LifecycleActivityLeaseSchema = z.object({
  kind: z.enum(LIFECYCLE_ACTIVITY_KINDS),
  pid: z.number().int().positive(),
  token: z.string(),
  startedAt: z.iso.datetime(),
});

export type LifecycleActivityLease = z.infer<typeof LifecycleActivityLeaseSchema>;

async function writeActivityMarker(envName: string, kind: LifecycleActivityKind): Promise<void> {
  await Bun.write(getLifecycleActivityPath(envName, kind), new Date().toISOString());
}

// Call only while holding the environment's lifecycle lock.
export async function touchLifecycleActivityUnderLock(
  envName: string,
  kind: LifecycleActivityKind
): Promise<void> {
  await writeActivityMarker(envName, kind);
}

export async function touchLifecycleActivity(
  envName: string,
  kind: LifecycleActivityKind
): Promise<void> {
  const lock = await acquireLifecycleLock(envName, { wait: true });
  if (!lock) {
    throw new Error(`Could not acquire lifecycle lock for '${envName}'`);
  }
  try {
    await writeActivityMarker(envName, kind);
  } finally {
    await lock.release();
  }
}

export async function withLifecycleActivityLease<T>(
  envName: string,
  kind: LifecycleActivityKind,
  callback: () => Promise<T>
): Promise<T> {
  const token = crypto.randomUUID();
  const lease: LifecycleActivityLease = {
    kind,
    pid: process.pid,
    token,
    startedAt: new Date().toISOString(),
  };
  const lock = await acquireLifecycleLock(envName, { wait: true });
  if (!lock) {
    throw new Error(`Could not acquire lifecycle lock for '${envName}'`);
  }
  try {
    await writeActivityMarker(envName, kind);
    await mkdir(getLifecycleLeaseDir(envName), { recursive: true });
    await Bun.write(getLifecycleLeasePath(envName, token), JSON.stringify(lease));
  } finally {
    await lock.release();
  }

  try {
    return await callback();
  } finally {
    const cleanupLock = await acquireLifecycleLock(envName, { wait: true });
    if (cleanupLock) {
      try {
        const leasePath = getLifecycleLeasePath(envName, token);
        const file = Bun.file(leasePath);
        if (await file.exists()) {
          const currentLease = LifecycleActivityLeaseSchema.safeParse(await file.json());
          if (currentLease.success && currentLease.data.token === token) {
            await unlink(leasePath);
          }
        }
        await writeActivityMarker(envName, kind);
      } finally {
        await cleanupLock.release();
      }
    }
  }
}

export async function getActiveLifecycleActivityLease(
  envName: string
): Promise<LifecycleActivityLease | null> {
  let entries: string[];
  try {
    entries = await readdir(getLifecycleLeaseDir(envName));
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }

  for (const entry of entries) {
    const leasePath = join(getLifecycleLeaseDir(envName), entry);
    const parsed = LifecycleActivityLeaseSchema.safeParse(await Bun.file(leasePath).json());
    if (!parsed.success) {
      throw new Error(`Invalid lifecycle activity lease for '${envName}'`);
    }
    if (isProcessRunning(parsed.data.pid)) {
      return parsed.data;
    }
    await unlink(leasePath);
  }
  return null;
}

async function getActivityTimestampMs(
  envName: string,
  kind: LifecycleActivityKind
): Promise<number | null> {
  try {
    const info = await stat(getLifecycleActivityPath(envName, kind));
    return info.mtimeMs;
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function getLatestLifecycleActivity(
  envName: string,
  kinds: LifecycleActivityKind[]
): Promise<{ kind: LifecycleActivityKind; timestampMs: number } | null> {
  const timestamps = await Promise.all(
    kinds.map(async (kind) => ({ kind, timestampMs: await getActivityTimestampMs(envName, kind) }))
  );

  let latest: { kind: LifecycleActivityKind; timestampMs: number } | null = null;
  for (const activity of timestamps) {
    if (activity.timestampMs === null) {
      continue;
    }
    if (!latest || activity.timestampMs > latest.timestampMs) {
      latest = { kind: activity.kind, timestampMs: activity.timestampMs };
    }
  }

  return latest;
}
