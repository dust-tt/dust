import { isValidSandboxFunctionSlug } from "@app/types/api/sandbox_functions";
import { z } from "zod";

export const FrameFunctionInvocationParamsSchema = z.object({
  frameId: z.string().min(1),
  name: z.string().refine(isValidSandboxFunctionSlug),
});

export const PostFrameFunctionInvocationBodySchema = z
  .object({
    input: z.unknown().optional(),
    context: z
      .object({
        timezone: z.string().optional(),
      })
      .optional(),
  })
  .strict();
