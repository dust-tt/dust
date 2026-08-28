import { randomUUID } from "node:crypto";
import path from "node:path";

import { shellEscape } from "@app/lib/api/sandbox/shell";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { isSafeFrameRelativePath } from "@app/types/api/frame_manifest";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";

export const FRAME_SOURCE_STAGING_ROOT = "/tmp/dust-frame-sources";
const FRAME_SOURCE_STAGING_CONCURRENCY = 8;

type FrameSourceFile = { relativePath: string; content: Buffer };

/** Stage one captured Frame source tree for a sandbox operation, then always remove it. */
export async function withStagedFrameSource<T, E>(
  auth: Authenticator,
  {
    sandbox,
    sourceFiles,
  }: {
    sandbox: SandboxResource;
    sourceFiles: ReadonlyArray<FrameSourceFile>;
  },
  callback: (stagingDirectory: string) => Promise<Result<T, E>>
): Promise<Result<T, E | SandboxFunctionError>> {
  const seenPaths = new Set<string>();
  for (const sourceFile of sourceFiles) {
    if (
      !isSafeFrameRelativePath(sourceFile.relativePath) ||
      seenPaths.has(sourceFile.relativePath)
    ) {
      return new Err(
        new SandboxFunctionError(
          "internal",
          `Invalid Frame source path: ${sourceFile.relativePath}`
        )
      );
    }
    seenPaths.add(sourceFile.relativePath);
  }

  const stagingDirectory = path.posix.join(
    FRAME_SOURCE_STAGING_ROOT,
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
      { concurrency: FRAME_SOURCE_STAGING_CONCURRENCY }
    );
    const stagingError = stagingResults.find((result) => result.isErr());
    if (stagingError?.isErr()) {
      return new Err(
        new SandboxFunctionError("internal", stagingError.error.message)
      );
    }

    return await callback(stagingDirectory);
  } finally {
    await sandbox.exec(auth, `rm -rf -- ${shellEscape(stagingDirectory)}`, {
      user: "agent-proxied",
    });
  }
}
