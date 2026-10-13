import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { PassThrough } from "node:stream";
import { finished } from "node:stream/promises";

import { rootCommand } from "@app/lib/api/sandbox/root_command";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { isSafeFrameRelativePath } from "@app/types/api/frame_manifest";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
import { TarArchive } from "archiver";

export const FRAME_SOURCE_STAGING_ROOT = "/var/lib/dust/frame-sources";
const FRAME_SOURCE_STAGING_ARCHIVE_NAME = "sources.tar";

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

/**
 * Build an uncompressed ustar of the captured Frame source tree. Entry names are
 * the validated relative paths (may include directories).
 */
export async function buildFrameSourceTarArchive(
  sourceFiles: ReadonlyArray<FrameSourceFile>
): Promise<Buffer> {
  const archive = new TarArchive({ gzip: false });
  const pass = new PassThrough();
  const chunks: Buffer[] = [];
  pass.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });
  const done = finished(pass);
  archive.pipe(pass);

  for (const sourceFile of sourceFiles) {
    archive.append(sourceFile.content, {
      name: sourceFile.relativePath,
      mode: 0o444,
    });
  }

  await archive.finalize();
  await done;
  return Buffer.concat(chunks);
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
  const archivePath = path.posix.join(
    stagingDirectory,
    FRAME_SOURCE_STAGING_ARCHIVE_NAME
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
      const archiveBuffer = await buildFrameSourceTarArchive(sourceFiles);
      const writeResult = await sandbox.writeFile(
        auth,
        archivePath,
        Uint8Array.from(archiveBuffer).buffer
      );
      if (writeResult.isErr()) {
        result = new Err(
          new SandboxFunctionError("internal", writeResult.error.message)
        );
      } else {
        // Extract, drop the archive so it is not part of the path-set, harden, hash paths.
        const hardenResult = await sandbox.execRoot(
          auth,
          rootCommand.unsafeShell(
            [
              `/usr/bin/tar -xf ${shellEscape(archivePath)} -C ${shellEscape(stagingDirectory)}`,
              `/usr/bin/rm -f -- ${shellEscape(archivePath)}`,
              `/usr/bin/chown -R root:root -- ${shellEscape(stagingDirectory)}`,
              `/usr/bin/find ${shellEscape(stagingDirectory)} -type d -exec /usr/bin/chmod 0555 -- {} +`,
              `/usr/bin/find ${shellEscape(stagingDirectory)} -type f -exec /usr/bin/chmod 0444 -- {} +`,
              `test -z "$(/usr/bin/find ${shellEscape(stagingDirectory)} ! -type d ! -type f -print -quit)"`,
              `/usr/bin/find ${shellEscape(stagingDirectory)} -type f -printf '%P\\0' | LC_ALL=C /usr/bin/sort -z | /usr/bin/sha256sum`,
            ].join(" && "),
            "Extract and harden captured Frame source before workload execution."
          )
        );
        const hardenFailure =
          rootCommandFailure(hardenResult, "Frame source staging extract") ??
          stagedSourcePathSetFailure(hardenResult, expectedPathSetSha256);
        if (hardenFailure) {
          result = new Err(hardenFailure);
        } else {
          result = await callback(stagingDirectory);
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
