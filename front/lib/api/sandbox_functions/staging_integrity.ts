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
 * Split exec stdout at the marker line: everything before it is dsbx output, everything after is
 * `<sha256>  <path>` lines. Without a marker the input is returned untouched with no hashes.
 * The split anchors on the LAST full-line marker so a model that prints the marker string from
 * its own code cannot shadow the real capture (the sha256 lines are always the last stdout
 * lines) and cannot truncate its own output by emitting a marker mid-stream.
 */
export function splitStagingStdout(stdout: string): {
  dsbxStdout: string;
  hashes: StagingHashes;
} {
  const lines = stdout.split("\n");
  const markerIndex = lines.findLastIndex((line) => line === HASH_MARKER);
  if (markerIndex === -1) {
    return { dsbxStdout: stdout, hashes: {} };
  }
  const hashes: StagingHashes = {};
  for (const line of lines.slice(markerIndex + 1)) {
    const match = /^([0-9a-f]{64}) {2}(\S.*)$/.exec(line.trim());
    if (match) {
      hashes[match[2]] = match[1];
    }
  }
  return { dsbxStdout: lines.slice(0, markerIndex).join("\n"), hashes };
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
  hashes: StagingHashes,
  opts?: { execStderr?: string }
): Result<void, SandboxFunctionError> {
  const expected = hashes[path];
  if (expected === undefined) {
    // A missing hash is how a failed capture surfaces (e.g. sha256sum could not open a
    // swapped target); include the exec stderr so the failure is debuggable.
    const stderrHint = opts?.execStderr?.trim()
      ? ` Exec stderr: ${opts.execStderr.trim().slice(0, 300)}`
      : "";
    return new Err(
      new SandboxFunctionError(
        "internal",
        `Missing integrity hash for staging file ${path}.${stderrHint}`
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
