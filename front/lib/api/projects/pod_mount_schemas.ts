import { z } from "zod";

export const PostPodFolderRequestBodySchema = z.object({
  folderName: z.string().min(1, "folderName is required"),
  parentRelativePath: z.string().optional(),
});
