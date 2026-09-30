import type { LabsTranscriptsConfigurationType } from "@app/types/labs";
import { z } from "zod";

export type GetLabsTranscriptsConfigurationResponseBody = {
  configuration: LabsTranscriptsConfigurationType | null;
};

export const PatchLabsTranscriptsConfigurationBodySchema = z.object({
  agentConfigurationId: z.string().optional(),
  // `isActive` is deprecated in favor of `status`, kept for backward compatibility.
  isActive: z.boolean().optional(),
  status: z.enum(["active", "disabled"]).optional(),
  dataSourceViewId: z.string().nullable().optional(),
});
export type PatchTranscriptsConfiguration = z.infer<
  typeof PatchLabsTranscriptsConfigurationBodySchema
>;
