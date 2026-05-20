import { z } from "zod";

export const MoveMountFileRequestBodySchema = z.object({
  parentRelativePath: z.string().optional(),
});
