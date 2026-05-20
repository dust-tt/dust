import inspector from "node:inspector/promises";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeoutAsync } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";

const CPU_PROFILE_DURATION_MS = 30_000;
const HEAP_PROFILE_DURATION_MS = 30_000;

export async function saveProfile({
  extension,
  filename,
  profile,
}: {
  extension: string;
  filename: string;
  profile: unknown;
}) {
  const tmpdir = os.tmpdir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  const profilePath = path.join(
    tmpdir,
    `${filename}-${timestamp}.${extension}`
  );
  await fs.writeFile(profilePath, JSON.stringify(profile));

  return profilePath;
}

export async function profileCPU(): Promise<string> {
  const session = new inspector.Session();

  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.start");

  await setTimeoutAsync(CPU_PROFILE_DURATION_MS);

  const { profile } = await session.post("Profiler.stop");

  const profilePath = await saveProfile({
    extension: "cpuprofile",
    filename: "cpu",
    profile,
  });

  session.disconnect();

  logger.info({ profilePath }, "CPU profile saved");

  return profilePath;
}

export async function profileHeap(): Promise<string> {
  const session = new inspector.Session();

  session.connect();
  await session.post("HeapProfiler.enable");

  // Start allocation timeline (tracks every allocation).
  await session.post("HeapProfiler.startSampling", {
    samplingInterval: 32768, // Bytes between samples.
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });

  await setTimeoutAsync(HEAP_PROFILE_DURATION_MS);

  const { profile } = await session.post("HeapProfiler.stopSampling");
  const profilePath = await saveProfile({
    extension: "heapprofile",
    filename: "heap-timeline",
    profile,
  });

  session.disconnect();

  logger.info({ profilePath }, "Heap timeline profile saved");

  return profilePath;
}
