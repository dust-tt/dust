import type { FileTypeWithUploadUrl } from "@app/types/files";
import { z } from "zod";

export interface FileUploadRequestResponseBody {
  file: FileTypeWithUploadUrl;
}

export const FileUploadedResponseBodySchema = z.object({
  file: z.object({ path: z.string().nullable() }),
});
