import { describe, expect, test } from "bun:test";
import {
  FRAME_FILES_DIR_ENV,
  FrameFilePathError,
  FrameFilesUnavailableError,
  filePath,
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
