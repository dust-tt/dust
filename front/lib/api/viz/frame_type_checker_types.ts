import { z } from "zod";

export const FrameValidationSnapshotSchema = z.object({
  typescriptVersion: z.string(),
  files: z.record(z.string()),
  modules: z.record(z.string()),
  defaultLibFileName: z.string(),
});

export type FrameValidationSnapshot = z.infer<
  typeof FrameValidationSnapshotSchema
>;

export interface FrameDiagnostic {
  file: string;
  line: number;
  column: number;
  code: number;
  message: string;
}
