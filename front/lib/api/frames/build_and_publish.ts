import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  FramePublicationFunctionArtifact,
  FramePublicationSourceFile,
} from "@app/lib/api/frames/publication_storage";
import {
  FramePublicationError,
  publishFramePublication,
} from "@app/lib/api/frames/publication_storage";
import { ensureConversationSandboxReadyWithScope } from "@app/lib/api/sandbox/lifecycle";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import { buildSandboxFunctionOnReadySandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { FrameManifest } from "@app/types/api/frame_manifest";
import { isSafeFrameRelativePath } from "@app/types/api/frame_manifest";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";

const FRAME_BUILD_STAGING_ROOT = "/tmp/dust-frame-publication-builds";
const FRAME_BUILD_STAGING_CONCURRENCY = 8;

/**
 * Stage one captured source snapshot in the invoking conversation's DSBX, build every function
 * declared by the manifest from that snapshot, then atomically publish the source and artifacts.
 * No publication storage is touched until every build has succeeded.
 */
export async function buildAndPublishFramePublication(
  auth: Authenticator,
  {
    conversation,
    frame,
    manifest,
    sourceFiles,
  }: {
    conversation: ConversationType;
    frame: FileResource;
    manifest: FrameManifest;
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

  const seenSourcePaths = new Set<string>();
  for (const sourceFile of sourceFiles) {
    if (
      !isSafeFrameRelativePath(sourceFile.relativePath) ||
      seenSourcePaths.has(sourceFile.relativePath)
    ) {
      return new Err(
        new FramePublicationError(
          "invalid_source",
          `Invalid Frame source path: ${sourceFile.relativePath}`
        )
      );
    }
    seenSourcePaths.add(sourceFile.relativePath);
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
  const sandbox = ensureResult.value.sandbox;
  const stagingDirectory = path.posix.join(
    FRAME_BUILD_STAGING_ROOT,
    randomUUID()
  );

  try {
    const stagingResults = await concurrentExecutor(
      sourceFiles,
      (sourceFile) =>
        sandbox.writeFile(
          auth,
          path.posix.join(stagingDirectory, sourceFile.relativePath),
          Uint8Array.from(sourceFile.content).buffer
        ),
      { concurrency: FRAME_BUILD_STAGING_CONCURRENCY }
    );
    const stagingError = stagingResults.find((result) => result.isErr());
    if (stagingError?.isErr()) {
      return new Err(
        new SandboxFunctionError("internal", stagingError.error.message)
      );
    }

    const functionArtifacts: FramePublicationFunctionArtifact[] = [];
    for (const fn of manifest.functions) {
      const buildResult = await buildSandboxFunctionOnReadySandbox(auth, {
        sandbox,
        srcSandboxPath: path.posix.join(stagingDirectory, fn.entryPoint),
      });
      if (buildResult.isErr()) {
        return new Err(
          new SandboxFunctionError(
            buildResult.error.code,
            `Failed to build Frame function "${fn.name}": ${buildResult.error.message}`
          )
        );
      }

      functionArtifacts.push({ name: fn.name, ...buildResult.value });
    }

    return publishFramePublication(auth, {
      frame,
      functionArtifacts,
      manifest,
      sourceFiles,
    });
  } finally {
    await sandbox.exec(auth, `rm -rf -- ${shellEscape(stagingDirectory)}`, {
      user: "agent-proxied",
    });
  }
}
