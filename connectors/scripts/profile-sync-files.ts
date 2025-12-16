// @ts-expect-error -- will be removed when we upgrade node types
import inspector from "node:inspector/promises";

import fs from "fs/promises";
import os from "os";
import path from "path";

import { syncFiles } from "@connectors/connectors/google_drive/temporal/activities/sync_files";
import logger from "@connectors/logger/logger";

const CONNECTOR_ID = 33966;
const DRIVE_FOLDER_ID = "1_aFk4iI54IFUVe2npcG2n5UQiZOKn-Kz";
const START_SYNC_TS = 1765895796000;

async function saveProfile({
  extension,
  filename,
  profile,
}: {
  extension: string;
  filename: string;
  profile: object;
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

async function main() {
  logger.info(
    {
      connectorId: CONNECTOR_ID,
      driveFolderId: DRIVE_FOLDER_ID,
      startSyncTs: START_SYNC_TS,
    },
    "Starting profiler for syncFiles"
  );

  const cpuSession = new inspector.Session();
  const heapSession = new inspector.Session();

  cpuSession.connect();
  heapSession.connect();

  // Start CPU profiler
  await cpuSession.post("Profiler.enable");
  await cpuSession.post("Profiler.start");

  // Start heap profiler
  await heapSession.post("HeapProfiler.enable");
  await heapSession.post("HeapProfiler.startSampling", {
    samplingInterval: 32768,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });

  logger.info("Profiling started, calling syncFiles");

  try {
    const result = await syncFiles(
      CONNECTOR_ID,
      DRIVE_FOLDER_ID,
      START_SYNC_TS,
      undefined,
      undefined
    );

    logger.info({ result }, "syncFiles completed");
  } catch (error) {
    logger.error({ error }, "syncFiles error");
  }

  logger.info("Stopping profilers and saving results");

  // Stop CPU profiler and save
  const { profile: cpuProfile } = await cpuSession.post("Profiler.stop");
  const cpuProfilePath = await saveProfile({
    extension: "cpuprofile",
    filename: "syncfiles-cpu",
    profile: cpuProfile,
  });
  cpuSession.disconnect();
  logger.info({ cpuProfilePath }, "CPU profile saved");

  // Stop heap profiler and save
  const { profile: heapProfile } = await heapSession.post(
    "HeapProfiler.stopSampling"
  );
  const heapProfilePath = await saveProfile({
    extension: "heapprofile",
    filename: "syncfiles-heap",
    profile: heapProfile,
  });
  heapSession.disconnect();
  logger.info({ heapProfilePath }, "Heap profile saved");

  logger.info({ cpuProfilePath, heapProfilePath }, "Profiling complete");

  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "Fatal error");
  process.exit(1);
});
