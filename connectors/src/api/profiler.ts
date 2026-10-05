import fs from "node:fs/promises";
import inspector from "node:inspector/promises";
import os from "node:os";
import path from "node:path";
import { apiConfig } from "@connectors/lib/api/config";
import { setTimeoutAsync } from "@connectors/lib/async_utils";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types/api";
import { isString } from "@connectors/types/shared/utils/general";
import type { Request, Response } from "express";

const CPU_PROFILE_DURATION_MS = 30_000;
const HEAP_PROFILE_DURATION_MS = 30_000;

export type GetProfilerResponse = WithConnectorsAPIErrorReponse<{
  cpu: string;
  heap: string;
}>;

async function saveProfile({
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

async function profileCPU(): Promise<string> {
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

async function profileHeap(): Promise<string> {
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

const _profilerAPIHandler = async (
  req: Request<never, GetProfilerResponse, { secret: string }>,
  res: Response<GetProfilerResponse>
) => {
  const secret = req.query.secret;
  const debugSecret = apiConfig.getProfilerSecret();

  if (!debugSecret || !isString(secret) || secret !== debugSecret) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid secret.",
      },
    });
  }

  const cpuProfile = await profileCPU();
  const heapProfile = await profileHeap();

  return res.json({
    cpu: cpuProfile,
    heap: heapProfile,
  });
};

export const profilerAPIHandler = withLogging(_profilerAPIHandler);
