import { z } from "zod";

export const GoResolveSuccessSchema = z.object({
  destination: z.string(),
});
