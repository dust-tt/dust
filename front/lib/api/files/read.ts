import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import type {
  FileShareScope,
  FileTypeWithMetadata,
  SharingGrantType,
} from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type ReadInteractiveContentFileError =
  | "file_not_found"
  | "not_interactive_content";

export type InteractiveContentFile = {
  file: FileTypeWithMetadata;
  content: string;
  shareInfo: {
    scope: FileShareScope;
    sharedAt: Date;
    shareUrl: string;
  } | null;
  sharingGrants: SharingGrantType[];
};

/**
 * Fetches an interactive-content file (a frame) by sId and returns its
 * serialized metadata together with the original file contents as a UTF-8
 * string. Returns a domain error when the file does not exist or is not an
 * interactive-content file.
 */
export async function readInteractiveContentFile(
  auth: Authenticator,
  sId: string
): Promise<Result<InteractiveContentFile, ReadInteractiveContentFileError>> {
  const file = await FileResource.fetchById(auth, sId);
  if (!file) {
    return new Err("file_not_found");
  }

  if (!file.isInteractiveContent) {
    return new Err("not_interactive_content");
  }

  const readStream = file.getReadStream({ auth, version: "original" });
  const chunks: Buffer[] = [];
  for await (const chunk of readStream) {
    chunks.push(chunk);
  }
  const content = Buffer.concat(chunks).toString("utf-8");

  const [shareInfo, sharingGrants] = await Promise.all([
    file.getShareInfo(),
    file.listAllSharingGrants(),
  ]);

  return new Ok({
    file: file.toJSONWithMetadata(auth),
    content,
    shareInfo,
    sharingGrants,
  });
}
