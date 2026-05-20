import { z } from "zod";

export const MoveMountFileRequestBodySchema = z.object({
  destRelativeFilePath: z.string().min(1),
});
