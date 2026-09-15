import { parentPort, workerData } from "node:worker_threads";
import { z } from "zod";
import { validateFrameSource } from "./frame_type_checker.ts";
import { FrameValidationSnapshotSchema } from "./frame_type_checker_types.ts";

const input = z
  .object({
    snapshot: FrameValidationSnapshotSchema,
    entryPoint: z.string(),
    files: z.record(z.string()),
  })
  .parse(workerData);

parentPort?.postMessage(
  validateFrameSource({
    snapshot: input.snapshot,
    entryPoint: input.entryPoint,
    readSource: (relativePath) =>
      Object.hasOwn(input.files, relativePath)
        ? input.files[relativePath]
        : undefined,
  })
);
