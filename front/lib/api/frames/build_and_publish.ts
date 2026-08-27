import path from "node:path";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type {
  FramePublicationError,
  FramePublicationFunctionArtifact,
  FramePublicationSourceFile,
} from "@app/lib/api/frames/publication_storage";
import { publishFramePublication } from "@app/lib/api/frames/publication_storage";
import { ensureConversationSandboxReadyWithScope } from "@app/lib/api/sandbox/lifecycle";
import { buildSandboxFunctionOnReadySandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { FrameManifest } from "@app/types/api/frame_manifest";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";

/**
 * Build every function declared by a Frame manifest, then atomically publish the source and built
 * artifacts in the invoking conversation's DSBX. The conversation filesystem may expose source
 * from the conversation itself or its Pod. No publication storage is touched until every path has
 * resolved and every build has succeeded.
 */
export async function buildAndPublishFramePublication(
  auth: Authenticator,
  {
    conversation,
    frame,
    manifest,
    sourceDirectoryPath,
    sourceFiles,
  }: {
    conversation: ConversationType;
    frame: FileResource;
    manifest: FrameManifest;
    sourceDirectoryPath: string;
    sourceFiles: FramePublicationSourceFile[];
  }
): Promise<
  Result<
    { publicationId: string },
    FramePublicationError | SandboxFunctionError
  >
> {
  if (manifest.functions.length === 0) {
    return publishFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest,
      sourceFiles,
    });
  }

  const ensureResult = await ensureConversationSandboxReadyWithScope(
    auth,
    conversation
  );
  if (ensureResult.isErr()) {
    return new Err(
      new SandboxFunctionError(
        "sandbox_unavailable",
        ensureResult.error.message
      )
    );
  }

  const fsResult = await DustFileSystem.forConversation(auth, {
    ...conversation,
    spaceId: ensureResult.value.scope.spaceId,
  });
  if (fsResult.isErr()) {
    return new Err(
      new SandboxFunctionError("invalid_path", fsResult.error.message)
    );
  }

  const buildInputs: { name: string; srcSandboxPath: string }[] = [];
  for (const fn of manifest.functions) {
    const sourcePath = path.posix.join(sourceDirectoryPath, fn.entryPoint);
    const srcResult = fsResult.value.toSandboxPath(sourcePath);
    if (srcResult.isErr()) {
      return new Err(
        new SandboxFunctionError(
          "invalid_path",
          `Invalid entry point for Frame function "${fn.name}": ${srcResult.error.message}`
        )
      );
    }
    buildInputs.push({ name: fn.name, srcSandboxPath: srcResult.value });
  }

  const functionArtifacts: FramePublicationFunctionArtifact[] = [];
  for (const { name, srcSandboxPath } of buildInputs) {
    const buildResult = await buildSandboxFunctionOnReadySandbox(auth, {
      sandbox: ensureResult.value.sandbox,
      srcSandboxPath,
    });
    if (buildResult.isErr()) {
      return new Err(
        new SandboxFunctionError(
          buildResult.error.code,
          `Failed to build Frame function "${name}": ${buildResult.error.message}`
        )
      );
    }

    functionArtifacts.push({ name, ...buildResult.value });
  }

  return publishFramePublication(auth, {
    frame,
    functionArtifacts,
    manifest,
    sourceFiles,
  });
}
