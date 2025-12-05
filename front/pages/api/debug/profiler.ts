import inspector from "node:inspector/promises";

import fs from "fs/promises";
import type { NextApiRequest, NextApiResponse } from "next";
import os from "os";
import path from "path";

import config from "@app/lib/api/config";
import { setTimeoutAsync } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const CPU_PROFILE_DURATION_MS = 30000;
const HEAP_PROFILE_DURATION_MS = 30000;

export interface GetProfilerResponse {
  cpu: string;
  heap: string;
}

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

async function profileCPU() {
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

async function profileHeap() {
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetProfilerResponse>>
) {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const { secret } = req.query;
  const debugSecret = config.getProfilerSecret();

  if (!debugSecret || typeof secret !== "string" || secret !== debugSecret) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid debug secret.",
      },
    });
  }

  const cpuProfile = await profileCPU();
  const heapProfile = await profileHeap();

  logger.info({ cpuProfile, heapProfile }, "Profiler completed");
  res.status(200).json({
    cpu: cpuProfile,
    heap: heapProfile,
  });
}
