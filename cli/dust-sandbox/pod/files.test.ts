import { describe, expect, test } from "bun:test";
import {
  FRAME_DATA_FILES_DIR_ENV,
  FrameFilesUnavailableError,
  filesDir,
  runWithInvocationEnv,
} from "@dust/pod";

const FILES_DIR = "/frames/fil_frame/files";

function inFrame<T>(fn: () => T): T {
  return runWithInvocationEnv({ [FRAME_DATA_FILES_DIR_ENV]: FILES_DIR }, fn);
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
      runWithInvocationEnv({ [FRAME_DATA_FILES_DIR_ENV]: other }, filesDir)
    ).toBe(other);
    expect(inFrame(filesDir)).toBe(FILES_DIR);
  });
});
