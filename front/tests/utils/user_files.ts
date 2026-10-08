import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { writeCanonicalFileContent } from "@app/lib/api/files/file_system_ops";
import type { Authenticator } from "@app/lib/auth";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";

/** Writes a file in the user's own files and returns its scoped path. */
export async function writeUserFile(
  auth: Authenticator,
  name: string,
  text: string,
  contentType = "text/markdown"
) {
  const path = `user-${auth.getNonNullableUser().sId}/${name}`;
  const dustFs = await DustFileSystem.forUser(auth);
  if (dustFs.isErr()) {
    throw dustFs.error;
  }
  const written = await writeCanonicalFileContent(
    auth,
    dustFs.value,
    path,
    new TextEncoder().encode(text),
    contentType
  );
  if (written.isErr()) {
    throw written.error;
  }
  // The storage mock does not keep the type a file was written with.
  fileStorageMock.setFileMetadata((gcsPath) =>
    gcsPath.endsWith(`/${name}`)
      ? { contentType, size: String(text.length) }
      : null
  );
  return path;
}
