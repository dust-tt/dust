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
import { buildFrameBundle } from "@app/lib/api/viz/build_frame_bundle";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { FrameManifest } from "@app/types/api/frame_manifest";
import { isSafeFrameRelativePath } from "@app/types/api/frame_manifest";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const FRAME_BUILD_STAGING_ROOT = "/tmp/dust-frame-publication-builds";
const FRAME_BUILD_STAGING_CONCURRENCY = 8;

async function buildFrameUiBundle({
  manifest,
  sourceFiles,
}: {
  manifest: FrameManifest;
  sourceFiles: FramePublicationSourceFile[];
}): Promise<Result<string, FramePublicationError>> {
  const sourceByPath = new Map(
    sourceFiles.map((sourceFile) => [
      sourceFile.relativePath,
      sourceFile.content,
    ])
  );
  const buildResult = await buildFrameBundle({
    entryRelPath: manifest.uiEntryPoint,
    reader: {
      list: async () => [...sourceByPath.keys()],
      read: async (relativePath) =>
        sourceByPath.get(relativePath)?.toString("utf8") ?? null,
    },
  });

  if (buildResult.isErr()) {
    return new Err(
      new FramePublicationError(
        "ui_build_failed",
        `Failed to build Frame UI: ${buildResult.error.message}`
      )
    );
  }

  return new Ok(buildResult.value.code);
}

/**
 * Build the UI and every declared function from one captured source snapshot, then atomically
 * publish its artifacts. Function builds stage the snapshot in the invoking conversation's DSBX;
 * source stays in its authoring scope. No publication storage is touched until every build succeeds.
 */
export async function buildAndPublishFramePublication(
  auth: Authenticator,
  {
    conversation,
    frame,
    manifest,
    sourceFiles,
  }: {
    conversation: ConversationWithoutContentType;
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

  const uiBundle = await buildFrameUiBundle({ manifest, sourceFiles });
  if (uiBundle.isErr()) {
    return uiBundle;
  }

  if (manifest.functions.length === 0) {
    return publishFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest,
      sourceFiles,
      uiBundleCode: uiBundle.value,
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
      uiBundleCode: uiBundle.value,
    });
  } finally {
    await sandbox.exec(auth, `rm -rf -- ${shellEscape(stagingDirectory)}`, {
      user: "agent-proxied",
    });
  }
}
