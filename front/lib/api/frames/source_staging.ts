import { createHash, randomUUID } from "node:crypto";
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

type RootExecResult = Awaited<ReturnType<SandboxResource["execRoot"]>>;

export function computeFrameSourcePathSetSha256(
  relativePaths: ReadonlyArray<string>
): string {
  const hash = createHash("sha256");
  const encodedPaths = relativePaths
    .map((relativePath) => Buffer.from(relativePath, "utf8"))
    .sort((left, right) => Buffer.compare(left, right));

  for (const encodedPath of encodedPaths) {
    hash.update(encodedPath);
    hash.update("\0");
  }

  return hash.digest("hex");
}

function rootCommandFailure(
  result: RootExecResult,
  operation: string
): SandboxFunctionError | undefined {
  if (result.isErr()) {
    return new SandboxFunctionError("internal", result.error.message);
  }
  if (result.value.exitCode !== 0) {
    const detail = result.value.stderr.trim() || result.value.stdout.trim();
    return new SandboxFunctionError(
      "internal",
      `${operation} failed with exit code ${result.value.exitCode}${detail ? `: ${detail}` : "."}`
    );
  }
  return undefined;
}

function stagedSourcePathSetFailure(
  result: RootExecResult,
  expectedSha256: string
): SandboxFunctionError | undefined {
  if (result.isErr()) {
    return new SandboxFunctionError("internal", result.error.message);
  }

  const match = /^([0-9a-f]{64}) {2}-$/.exec(result.value.stdout.trim());
  if (!match) {
    return new SandboxFunctionError(
      "internal",
      "Frame source staging did not produce a valid path-set hash."
    );
  }
  if (match[1] !== expectedSha256) {
    return new SandboxFunctionError(
      "internal",
      "Staged Frame source file set differs from the captured source."
    );
  }

  return undefined;
}

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
  const expectedPathSetSha256 = computeFrameSourcePathSetSha256(
    sourceFiles.map((sourceFile) => sourceFile.relativePath)
  );
  let result: Result<T, E | SandboxFunctionError>;
  let cleanupResult: RootExecResult;
  try {
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
    const createFailure = rootCommandFailure(
      createResult,
      "Frame source staging creation"
    );
    if (createFailure) {
      result = new Err(createFailure);
    } else {
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
      const stagingError = stagingResults.find((item) => item.isErr());
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
              `/usr/bin/find ${shellEscape(stagingDirectory)} -type f -printf '%P\\0' | LC_ALL=C /usr/bin/sort -z | /usr/bin/sha256sum`,
            ].join(" && "),
            "Harden and validate captured Frame source before workload execution."
          )
        );
        const hardenFailure =
          rootCommandFailure(hardenResult, "Frame source staging hardening") ??
          stagedSourcePathSetFailure(hardenResult, expectedPathSetSha256);
        if (hardenFailure) {
          result = new Err(hardenFailure);
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
    }
  } finally {
    cleanupResult = await sandbox.execRoot(
      auth,
      rootCommand.exec("/usr/bin/rm", ["-rf", "--", stagingDirectory])
    );
  }
  const cleanupFailure = rootCommandFailure(
    cleanupResult,
    "Frame source staging cleanup"
  );
  if (cleanupFailure) {
    return new Err(cleanupFailure);
  }
  return result;
}
