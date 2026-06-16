import { z } from "zod";

export const FILES_SCOPE_SCHEMA = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("conversation"),
    conversation_id: z
      .string()
      .describe("Conversation id whose file system to use."),
  }),
  z.object({
    type: z.literal("pod"),
    pod_id: z.string().describe("Pod id whose file system to use."),
  }),
]);

export type FilesScope = z.infer<typeof FILES_SCOPE_SCHEMA>;
