import { stat } from "node:fs/promises";
import { isErrnoException } from "./errors";
import { getLifecycleActivityPath } from "./paths";

export const LIFECYCLE_ACTIVITY_KINDS = ["command", "frontend", "test"] as const;
export type LifecycleActivityKind = (typeof LIFECYCLE_ACTIVITY_KINDS)[number];

export async function touchLifecycleActivity(
  envName: string,
  kind: LifecycleActivityKind
): Promise<void> {
  await Bun.write(getLifecycleActivityPath(envName, kind), new Date().toISOString());
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
