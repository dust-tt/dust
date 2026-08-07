import { createHash } from "node:crypto";
import {
  splitStagingStdout,
  stagingHashCaptureLines,
  verifyStagingContent,
} from "@app/lib/api/sandbox_functions/staging_integrity";
import { describe, expect, it } from "vitest";

const sha256Hex = (content: string): string =>
  createHash("sha256").update(content).digest("hex");

describe("stagingHashCaptureLines", () => {
  it("emits the marker then a single sha256sum invocation", () => {
    const lines = stagingHashCaptureLines([
      "/tmp/x/bundle.js",
      "/tmp/x/schema.json",
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("echo __DUST_STAGING_SHA256__");
    expect(lines[1]).toBe(
      "/usr/bin/sha256sum '/tmp/x/bundle.js' '/tmp/x/schema.json'"
    );
  });

  it("shell-escapes unsafe paths", () => {
    const lines = stagingHashCaptureLines(["/tmp/x/a b.js"]);
    expect(lines[1]).toBe("/usr/bin/sha256sum '/tmp/x/a b.js'");
  });
});

describe("splitStagingStdout", () => {
  it("returns untouched stdout and no hashes without the marker", () => {
    const { dsbxStdout, hashes } = splitStagingStdout('{"ok":true}');
    expect(dsbxStdout).toBe('{"ok":true}');
    expect(hashes).toEqual({});
  });

  it("splits dsbx output from hash lines at the marker", () => {
    const bundle = "/tmp/dust-sandbox-function-builds/uuid/bundle.js";
    const schema = "/tmp/dust-sandbox-function-builds/uuid/schema.json";
    const stdout = [
      "some noise",
      '{"ok":true}',
      "__DUST_STAGING_SHA256__",
      `${sha256Hex("bundle")}  ${bundle}`,
      `${sha256Hex("schema")}  ${schema}`,
      "",
    ].join("\n");
    const { dsbxStdout, hashes } = splitStagingStdout(stdout);
    expect(dsbxStdout).toBe('some noise\n{"ok":true}');
    expect(hashes).toEqual({
      [bundle]: sha256Hex("bundle"),
      [schema]: sha256Hex("schema"),
    });
  });

  it("anchors on the last full-line marker, so a forged marker cannot shadow the capture", () => {
    const schema = "/tmp/dust-sandbox-function-builds/uuid/schema.json";
    const stdout = [
      "model printed __DUST_STAGING_SHA256__ mid-stream",
      "__DUST_STAGING_SHA256__", // forged full-line marker before the real one
      `${"0".repeat(64)}  ${schema}`, // forged hash line, shadowed below
      '{"ok":true}',
      "__DUST_STAGING_SHA256__", // real capture marker
      `${sha256Hex("schema")}  ${schema}`,
      "",
    ].join("\n");
    const { dsbxStdout, hashes } = splitStagingStdout(stdout);
    expect(hashes).toEqual({ [schema]: sha256Hex("schema") });
    expect(dsbxStdout).toContain('{"ok":true}');
  });

  it("does not split on a marker substring inside another line", () => {
    const stdout = 'noise __DUST_STAGING_SHA256__ noise\n{"ok":true}\n';
    const { dsbxStdout, hashes } = splitStagingStdout(stdout);
    expect(dsbxStdout).toBe(stdout);
    expect(hashes).toEqual({});
  });

  it("ignores malformed hash lines", () => {
    const stdout = '{"ok":true}\n__DUST_STAGING_SHA256__\nnot-a-hash-line\n';
    const { hashes } = splitStagingStdout(stdout);
    expect(hashes).toEqual({});
  });
});

describe("verifyStagingContent", () => {
  it("accepts content matching the captured hash", () => {
    const result = verifyStagingContent(
      "/tmp/x/bundle.js",
      Buffer.from("bundle"),
      {
        "/tmp/x/bundle.js": sha256Hex("bundle"),
      }
    );
    expect(result.isOk()).toBe(true);
  });

  it("rejects mismatched content without leaking it in the error", () => {
    const result = verifyStagingContent(
      "/tmp/x/bundle.js",
      Buffer.from("secret-bytes"),
      { "/tmp/x/bundle.js": sha256Hex("bundle") }
    );
    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("internal");
    expect(result.error.message).not.toContain("secret-bytes");
  });

  it("includes the exec stderr hint when the hash is missing", () => {
    const result = verifyStagingContent(
      "/tmp/x/bundle.js",
      Buffer.from("bundle"),
      {},
      {
        execStderr: "sha256sum: /tmp/x/bundle.js: Permission denied",
      }
    );
    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.message).toContain("Permission denied");
  });

  it("rejects when the hash is missing", () => {
    const result = verifyStagingContent(
      "/tmp/x/bundle.js",
      Buffer.from("bundle"),
      {}
    );
    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.message).toContain("Missing integrity hash");
  });
});
