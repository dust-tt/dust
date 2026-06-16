import { z } from "zod";

export const PostRequestAccessBodySchema = z.object({
  emailMessage: z.string(),
  dataSourceId: z.string(),
});

export type PostRequestAccessBody = z.infer<typeof PostRequestAccessBodySchema>;
