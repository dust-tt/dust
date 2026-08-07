import { createHash } from "node:crypto";

import { shellEscape } from "@app/lib/api/sandbox/shell";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

// Front reads build/schema artifacts back through the provider's file API, which envd serves as
// root and follows symlinks. The producing exec runs as agent-proxied and stages artifacts in an
// agent-writable /tmp dir, so anything the agent runs concurrently can replace an artifact with a
// symlink to a root-only file between the exec and the read (TOCTOU), and the root read then
// returns that file's content. Pin every artifact to the sha256 captured at the end of the
// producing exec: a swap before the capture fails the capture itself (`set -e`, sha256sum cannot
// open the swapped target as agent-proxied), a swap after the capture no longer hashes equal.

const HASH_MARKER = "__DUST_STAGING_SHA256__";
const SHA256SUM_BIN = "/usr/bin/sha256sum";

export type StagingHashes = Record<string, string>;

/** Shell lines appended to a staging exec: a marker line, then one sha256 line per artifact. */
export function stagingHashCaptureLines(paths: string[]): string[] {
  return [
    `echo ${HASH_MARKER}`,
    `${SHA256SUM_BIN} ${paths.map((p) => shellEscape(p)).join(" ")}`,
  ];
}

/**
 * Split exec stdout at the marker: everything before it is dsbx output, everything after is
 * `<sha256>  <path>` lines. Without a marker the input is returned untouched with no hashes.
 */
export function splitStagingStdout(stdout: string): {
  dsbxStdout: string;
  hashes: StagingHashes;
} {
  const markerIndex = stdout.indexOf(HASH_MARKER);
  if (markerIndex === -1) {
    return { dsbxStdout: stdout, hashes: {} };
  }
  const hashes: StagingHashes = {};
  for (const line of stdout
    .slice(markerIndex + HASH_MARKER.length)
    .split("\n")) {
    const match = /^([0-9a-f]{64}) {2}(\S.*)$/.exec(line.trim());
    if (match) {
      hashes[match[2]] = match[1];
    }
  }
  return { dsbxStdout: stdout.slice(0, markerIndex), hashes };
}

function sha256Hex(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Verify a read-back artifact against its captured hash. Error messages never carry content, so
 * a swapped-in secret cannot leak through the error path.
 */
export function verifyStagingContent(
  path: string,
  content: Buffer,
  hashes: StagingHashes
): Result<void, SandboxFunctionError> {
  const expected = hashes[path];
  if (expected === undefined) {
    return new Err(
      new SandboxFunctionError(
        "internal",
        `Missing integrity hash for staging file ${path}.`
      )
    );
  }
  if (sha256Hex(content) !== expected) {
    return new Err(
      new SandboxFunctionError(
        "internal",
        `Staging file ${path} changed between production and read-back; refusing to use it.`
      )
    );
  }
  return new Ok(undefined);
}
