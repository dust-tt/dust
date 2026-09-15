import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { z } from "zod";
import { validateFrameSource } from "../../../front/lib/api/viz/frame_type_checker.ts";
import type { FrameValidationSnapshot } from "../../../front/lib/api/viz/frame_type_checker_types.ts";
import { runFrameValidationCli } from "./cli.ts";

const InputSchema = z.object({
  entryPoint: z.string(),
  files: z.record(z.string()),
});

export function runFrameValidator(snapshot: FrameValidationSnapshot): void {
  if (isMainThread) {
    runFrameValidationCli(snapshot);
    return;
  }

  const input = InputSchema.parse(workerData);
  const diagnostics = validateFrameSource({
    snapshot,
    entryPoint: input.entryPoint,
    readSource: (relativePath) =>
      Object.hasOwn(input.files, relativePath)
        ? input.files[relativePath]
        : undefined,
  });
  parentPort?.postMessage(diagnostics);
}
