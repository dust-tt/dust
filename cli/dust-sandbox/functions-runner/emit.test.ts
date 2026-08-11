import { describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  applyResultSpillPolicy,
  RESULT_HARD_CAP_BYTES,
  RESULT_INLINE_CAP_BYTES,
} from "./emit.ts";
import type { Output } from "./protocol.ts";

function outputOfSerializedBytes(targetBytes: number): Output {
  // {"ok":true,"output":{"big":"…"}} — pad `big` so the serialized envelope
  // lands exactly on targetBytes.
  const overhead = JSON.stringify({ ok: true, output: { big: "" } }).length;
  return { ok: true, output: { big: "x".repeat(targetBytes - overhead) } };
}

function scratchDir(): string {
  return mkdtempSync(join(tmpdir(), "dsbx-emit-test-"));
}

describe("applyResultSpillPolicy", () => {
  test("returns the outcome unchanged at the inline cap", () => {
    const out = outputOfSerializedBytes(RESULT_INLINE_CAP_BYTES);
    const dir = scratchDir();
    try {
      expect(applyResultSpillPolicy(out, dir)).toBe(out);
      expect(readdirSync(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("spills one byte over the inline cap and points at the file", () => {
    const out = outputOfSerializedBytes(RESULT_INLINE_CAP_BYTES + 1);
    const dir = scratchDir();
    try {
      const delivered = applyResultSpillPolicy(out, dir);
      if (!("resultFile" in delivered)) {
        throw new Error(`expected a pointer, got ${JSON.stringify(delivered)}`);
      }
      expect(delivered.ok).toBe(true);
      expect(delivered.resultBytes).toBe(RESULT_INLINE_CAP_BYTES + 1);
      expect(delivered.resultFile.startsWith(dir)).toBe(true);
      expect(readFileSync(delivered.resultFile, "utf8")).toBe(
        JSON.stringify(out)
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("refuses a result over the hard cap with output_too_large", () => {
    const out = outputOfSerializedBytes(RESULT_HARD_CAP_BYTES + 1);
    const dir = scratchDir();
    try {
      const delivered = applyResultSpillPolicy(out, dir);
      if (delivered.ok !== false) {
        throw new Error("expected an error outcome");
      }
      expect(delivered.error.code).toBe("output_too_large");
      expect(delivered.error.message).toContain(
        `${RESULT_HARD_CAP_BYTES + 1} bytes`
      );
      expect(delivered.error.message).toContain("pod file");
      // Nothing was written.
      expect(readdirSync(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("falls back to inline emission when the spill write fails", () => {
    const out = outputOfSerializedBytes(RESULT_INLINE_CAP_BYTES + 1);
    const dir = scratchDir();
    try {
      // A spill dir that cannot be created: a path under an existing file.
      const occupied = join(dir, "not-a-dir");
      writeFileSync(occupied, "occupied");
      const delivered = applyResultSpillPolicy(out, join(occupied, "sub"));
      expect(delivered).toBe(out);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("spills large error outcomes too", () => {
    const message = "x".repeat(RESULT_INLINE_CAP_BYTES + 1);
    const out: Output = {
      ok: false,
      error: { code: "threw", message },
    };
    const dir = scratchDir();
    try {
      const delivered = applyResultSpillPolicy(out, dir);
      if (!("resultFile" in delivered)) {
        throw new Error("expected a pointer");
      }
      expect(JSON.parse(readFileSync(delivered.resultFile, "utf8"))).toEqual(
        out
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
