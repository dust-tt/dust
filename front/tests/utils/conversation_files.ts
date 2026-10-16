import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { writeCanonicalFileContent } from "@app/lib/api/files/file_system_ops";
import type { Authenticator } from "@app/lib/auth";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";

/**
 * Writes a Markdown file in a new conversation and returns its scoped path. Unlike a user's own
 * files, conversation files are stored with revisions, which the storage mock keeps from here on.
 */
export async function writeConversationFile(
  auth: Authenticator,
  name: string,
  text: string
) {
  fileStorageMock.enableVersioning();
  // The storage mock does not keep the type a file was written with.
  fileStorageMock.setFileMetadata(() => ({
    contentType: "text/markdown",
    size: "0",
  }));
  const conversation = await ConversationFactory.createPlain(auth);
  const path = `conversation-${conversation.sId}/${name}`;
  const dustFs = await DustFileSystem.fromScopedPath(auth, path);
  if (dustFs.isErr()) {
    throw dustFs.error;
  }
  const written = await writeCanonicalFileContent(
    auth,
    dustFs.value,
    path,
    new TextEncoder().encode(text),
    "text/markdown"
  );
  if (written.isErr()) {
    throw written.error;
  }
  return path;
}
