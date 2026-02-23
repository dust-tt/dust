import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { pipeline } from "stream/promises";

export async function copyContent(
  auth: Authenticator,
  sourceFile: FileResource,
  targetFile: FileResource
) {
  // Get a read stream from the source file's original version.
  const readStream = sourceFile.getReadStream({
    auth,
    version: "original",
  });

  // Write a copy of the source file's content to the new file.
  await pipeline(
    readStream,
    targetFile.getWriteStream({ auth, version: "original" })
  );
}
