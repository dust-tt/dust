import { randomUUID } from "node:crypto";
import path from "node:path";

import { rootCommand } from "@app/lib/api/sandbox/root_command";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { isSafeFrameRelativePath } from "@app/types/api/frame_manifest";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export const FRAME_SOURCE_STAGING_ROOT = "/var/lib/dust/frame-sources";
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
  const createResult = await sandbox.execRoot(
    auth,
    rootCommand.and([
      rootCommand.exec("/usr/bin/install", [
        "-d",
        "-m",
        "0711",
        "-o",
        "root",
        "-g",
        "root",
        FRAME_SOURCE_STAGING_ROOT,
      ]),
      rootCommand.exec("/usr/bin/install", [
        "-d",
        "-m",
        "0755",
        "-o",
        "root",
        "-g",
        "root",
        stagingDirectory,
      ]),
    ])
  );
  if (createResult.isErr()) {
    return new Err(
      new SandboxFunctionError("internal", createResult.error.message)
    );
  }

  let result: Result<T, E | SandboxFunctionError>;
  let cleanupResult: Awaited<ReturnType<SandboxResource["execRoot"]>>;
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
      result = new Err(
        new SandboxFunctionError("internal", stagingError.error.message)
      );
    } else {
      const hardenResult = await sandbox.execRoot(
        auth,
        rootCommand.unsafeShell(
          [
            `/usr/bin/chown -R root:root -- ${shellEscape(stagingDirectory)}`,
            `/usr/bin/find ${shellEscape(stagingDirectory)} -type d -exec /usr/bin/chmod 0555 -- {} +`,
            `/usr/bin/find ${shellEscape(stagingDirectory)} -type f -exec /usr/bin/chmod 0444 -- {} +`,
            `test -z "$(/usr/bin/find ${shellEscape(stagingDirectory)} ! -type d ! -type f -print -quit)"`,
          ].join(" && "),
          "Harden and validate captured Frame source before workload execution."
        )
      );
      if (hardenResult.isErr()) {
        result = new Err(
          new SandboxFunctionError("internal", hardenResult.error.message)
        );
      } else {
        const verificationResults = await concurrentExecutor(
          sourceFiles,
          async (sourceFile) => {
            const stagedPath = path.posix.join(
              stagingDirectory,
              sourceFile.relativePath
            );
            const readResult = await sandbox.readFile(auth, stagedPath);
            if (readResult.isErr()) {
              return new Err(readResult.error);
            }
            return Buffer.compare(readResult.value, sourceFile.content) === 0
              ? new Ok(undefined)
              : new Err(
                  new Error(`Staged Frame source changed: ${stagedPath}`)
                );
          },
          { concurrency: FRAME_SOURCE_STAGING_CONCURRENCY }
        );
        const verificationError = verificationResults.find((item) =>
          item.isErr()
        );
        result = verificationError?.isErr()
          ? new Err(
              new SandboxFunctionError(
                "internal",
                verificationError.error.message
              )
            )
          : await callback(stagingDirectory);
      }
    }
  } finally {
    cleanupResult = await sandbox.execRoot(
      auth,
      rootCommand.exec("/usr/bin/rm", ["-rf", "--", stagingDirectory])
    );
  }
  if (cleanupResult.isErr()) {
    return new Err(
      new SandboxFunctionError("internal", cleanupResult.error.message)
    );
  }
  return result;
}
