import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  resolveToolTextContent,
  TOOL_OUTPUT_OFFLOAD_META_KEY,
  ToolOutputResolutionError,
} from "@dust/sandbox";

let mountRootDir: string;

beforeEach(() => {
  mountRootDir = mkdtempSync(join(tmpdir(), "dust-pod-tool-output-test-"));
});

afterEach(() => {
  rmSync(mountRootDir, { recursive: true, force: true });
});

// Writes an archived tool output under the fake mount root, like front does
// through the GCS API, and returns the descriptor-carrying block.
function makeOffloadedBlock(
  scopedPath: string,
  content: string | null,
  descriptorOverrides: Record<string, unknown> = {}
) {
  if (content !== null) {
    const path = join(mountRootDir, scopedPath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return {
    type: "resource",
    resource: {
      uri: scopedPath,
      mimeType: "text/plain",
      text: `snippet...\n[Full content archived at ${scopedPath}]`,
    },
    _meta: {
      [TOOL_OUTPUT_OFFLOAD_META_KEY]: {
        fullContentPath: scopedPath,
        totalBytes: content === null ? 0 : Buffer.byteLength(content, "utf8"),
        contentType: "application/json",
        ...descriptorOverrides,
      },
    },
  };
}

describe("inline passthrough", () => {
  test("returns the text of a text block without a descriptor", async () => {
    const text = '{"ok":true}';
    expect(await resolveToolTextContent({ type: "text", text })).toBe(text);
  });

  test("returns the resource text of an embedded resource without a descriptor", async () => {
    const text = "resource body";
    const block = {
      type: "resource",
      resource: { uri: "file://x.txt", mimeType: "text/plain", text },
    };
    expect(await resolveToolTextContent(block)).toBe(text);
  });

  test("ignores unrelated _meta keys", async () => {
    const block = {
      type: "text",
      text: "hello",
      _meta: { "tt.dust/other": { a: 1 } },
    };
    expect(await resolveToolTextContent(block)).toBe("hello");
  });

  test("throws a typed error when the block carries no text and no descriptor", async () => {
    await expect(
      resolveToolTextContent({
        type: "image",
        data: "...",
        mimeType: "image/png",
      })
    ).rejects.toThrow(ToolOutputResolutionError);
  });

  test("throws a typed error on a non-object block", async () => {
    await expect(resolveToolTextContent("just a string")).rejects.toThrow(
      ToolOutputResolutionError
    );
  });
});

describe("descriptor resolution", () => {
  test("reads the full content from the mount, not the inline snippet", async () => {
    const full = JSON.stringify({
      items: Array.from({ length: 50 }, (_, i) => i),
    });
    const block = makeOffloadedBlock(
      "pod-spc_x/.tool_outputs/fn/1_tool.json",
      full
    );

    const resolved = await resolveToolTextContent(block, { mountRootDir });

    expect(resolved).toBe(full);
    expect(resolved).not.toContain("[Full content archived at ");
  });

  test("uses an absolute fullContentPath as-is", async () => {
    const full = "absolute content";
    const scopedPath = "pod-spc_x/.tool_outputs/fn/2_tool.json";
    const absolutePath = join(mountRootDir, scopedPath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, full);

    const block = makeOffloadedBlock(scopedPath, null, {
      fullContentPath: absolutePath,
    });

    // No mountRootDir override: the absolute path must not be re-rooted.
    expect(await resolveToolTextContent(block)).toBe(full);
  });

  test("throws a typed error on a malformed descriptor", async () => {
    const block = makeOffloadedBlock(
      "pod-spc_x/.tool_outputs/fn/3_tool.json",
      "x",
      { fullContentPath: undefined }
    );

    await expect(
      resolveToolTextContent(block, { mountRootDir })
    ).rejects.toThrow(ToolOutputResolutionError);
  });
});

describe("mount staleness retry", () => {
  test("retries until the file appears", async () => {
    const scopedPath = "pod-spc_x/.tool_outputs/fn/4_tool.json";
    const full = '{"late":true}';
    const block = makeOffloadedBlock(scopedPath, null);

    // Simulate gcsfuse staleness: the file only becomes visible after a beat.
    setTimeout(() => {
      const path = join(mountRootDir, scopedPath);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, full);
    }, 60);

    const resolved = await resolveToolTextContent(block, {
      mountRootDir,
      maxAttempts: 10,
      retryDelayMs: 25,
    });

    expect(resolved).toBe(full);
  });

  test("throws a typed error naming the path on retry exhaustion", async () => {
    const scopedPath = "pod-spc_x/.tool_outputs/fn/5_tool.json";
    const block = makeOffloadedBlock(scopedPath, null);

    const startedAtMs = Date.now();
    let caught: unknown;
    try {
      await resolveToolTextContent(block, {
        mountRootDir,
        maxAttempts: 3,
        retryDelayMs: 20,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ToolOutputResolutionError);
    if (caught instanceof ToolOutputResolutionError) {
      expect(caught.message).toContain(join(mountRootDir, scopedPath));
      expect(caught.message).toContain("3 attempts");
    }
    // Two inter-attempt delays of 20 ms must have elapsed.
    expect(Date.now() - startedAtMs).toBeGreaterThanOrEqual(40);
  });
});
