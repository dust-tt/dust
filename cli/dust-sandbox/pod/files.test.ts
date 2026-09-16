import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FRAME_FILES_DIR_ENV,
  FrameFilePathError,
  FrameFilesUnavailableError,
  filePath,
  files,
  filesDir,
  runWithInvocationEnv,
} from "@dust/pod";

const FILES_DIR = "/frames/fil_frame/files";

function inFrame<T>(fn: () => T): T {
  return runWithInvocationEnv({ [FRAME_FILES_DIR_ENV]: FILES_DIR }, fn);
}

describe("filesDir", () => {
  test("returns the folder front set for this invocation", () => {
    expect(inFrame(filesDir)).toBe(FILES_DIR);
  });

  test("throws outside a Frame function", () => {
    expect(() => runWithInvocationEnv({}, filesDir)).toThrow(
      FrameFilesUnavailableError
    );
  });

  test("resolves per invocation so a resident worker cannot cross wires", () => {
    const other = "/frames/fil_other/files";
    expect(
      runWithInvocationEnv({ [FRAME_FILES_DIR_ENV]: other }, filesDir)
    ).toBe(other);
    expect(inFrame(filesDir)).toBe(FILES_DIR);
  });
});

describe("filePath", () => {
  test("joins a relative path under the folder", () => {
    expect(inFrame(() => filePath("uploads/a.png"))).toBe(
      `${FILES_DIR}/uploads/a.png`
    );
  });

  test("normalizes without escaping", () => {
    expect(inFrame(() => filePath("uploads/../a.png"))).toBe(
      `${FILES_DIR}/a.png`
    );
  });

  test.each([
    ["../../sandbox-state/databases/chat.db", "parent traversal"],
    ["uploads/../../../etc/passwd", "traversal after a valid segment"],
    ["/etc/passwd", "absolute path"],
    ["", "empty path"],
    [".", "the folder itself"],
    ["uploads/\0.png", "null byte"],
  ])("refuses %j (%s)", (relativePath) => {
    expect(() => inFrame(() => filePath(relativePath))).toThrow(
      FrameFilePathError
    );
  });

  test("refuses a sibling folder sharing the prefix", () => {
    expect(() => inFrame(() => filePath("../files-other/a.png"))).toThrow(
      FrameFilePathError
    );
  });
});

describe("files", () => {
  const roots: string[] = [];

  function inRealFolder<T>(fn: () => Promise<T>): Promise<T> {
    const root = mkdtempSync(join(tmpdir(), "dust-frame-files-"));
    roots.push(root);
    return runWithInvocationEnv({ [FRAME_FILES_DIR_ENV]: root }, fn);
  }

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("write creates missing parent directories", async () => {
    const written = await inRealFolder(async () =>
      files.write("uploads/2026/a.png", "bytes")
    );

    expect(readFileSync(written, "utf-8")).toBe("bytes");
  });

  test("read returns what write stored", async () => {
    const read = await inRealFolder(async () => {
      await files.write("uploads/a.png", "bytes");
      return files.read("uploads/a.png");
    });

    expect(read.toString("utf-8")).toBe("bytes");
  });

  test("list returns an empty array for a folder never written to", async () => {
    expect(await inRealFolder(() => files.list())).toEqual([]);
    expect(await inRealFolder(() => files.list("uploads"))).toEqual([]);
  });

  test("list names entries directly inside the folder", async () => {
    const names = await inRealFolder(async () => {
      await files.write("uploads/a.png", "a");
      await files.write("uploads/b.png", "b");
      return files.list("uploads");
    });

    expect(names.sort()).toEqual(["a.png", "b.png"]);
  });

  test("remove deletes, and succeeds when already absent", async () => {
    const remaining = await inRealFolder(async () => {
      await files.write("uploads/a.png", "a");
      await files.remove("uploads/a.png");
      await files.remove("uploads/a.png");
      return files.list("uploads");
    });

    expect(remaining).toEqual([]);
  });

  test("every helper refuses a path escaping the folder", async () => {
    await inRealFolder(async () => {
      const escape = "../../etc/passwd";
      expect(files.write(escape, "x")).rejects.toThrow(FrameFilePathError);
      expect(files.read(escape)).rejects.toThrow(FrameFilePathError);
      expect(files.list(escape)).rejects.toThrow(FrameFilePathError);
      expect(files.remove(escape)).rejects.toThrow(FrameFilePathError);
    });
  });

  test("write does not follow a path out of the folder", async () => {
    const root = mkdtempSync(join(tmpdir(), "dust-frame-files-"));
    roots.push(root);
    const outside = join(root, "..", "outside.txt");
    writeFileSync(outside, "original");

    await runWithInvocationEnv({ [FRAME_FILES_DIR_ENV]: root }, async () => {
      expect(files.write("../outside.txt", "tampered")).rejects.toThrow(
        FrameFilePathError
      );
    });

    expect(readFileSync(outside, "utf-8")).toBe("original");
    rmSync(outside, { force: true });
  });
});
