import { authorizedFileRefSchema } from "@app/types/files";
import { z } from "zod";

export const GetFrameAuthorizedFilesResponseBodySchema = z.object({
  /** Refs the Frame declared when last saved; empty when none or stale against its content. */
  refs: z.array(authorizedFileRefSchema),
});

export type GetFrameAuthorizedFilesResponseBody = z.infer<
  typeof GetFrameAuthorizedFilesResponseBodySchema
>;
