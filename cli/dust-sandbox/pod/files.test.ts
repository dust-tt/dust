import { describe, expect, test } from "bun:test";
import {
  FRAME_PERSISTENT_FILES_DIR_ENV,
  FrameFilesUnavailableError,
  persistentFilesDir,
  runWithInvocationEnv,
} from "@dust/pod";

const FILES_DIR = "/frames/fil_frame/files";

function inFrame<T>(fn: () => T): T {
  return runWithInvocationEnv(
    { [FRAME_PERSISTENT_FILES_DIR_ENV]: FILES_DIR },
    fn
  );
}

describe("persistentFilesDir", () => {
  test("returns the folder front set for this invocation", () => {
    expect(inFrame(persistentFilesDir)).toBe(FILES_DIR);
  });

  test("throws outside a Frame function", () => {
    expect(() => runWithInvocationEnv({}, persistentFilesDir)).toThrow(
      FrameFilesUnavailableError
    );
  });

  test("resolves per invocation so a resident worker cannot cross wires", () => {
    const other = "/frames/fil_other/files";
    expect(
      runWithInvocationEnv(
        { [FRAME_PERSISTENT_FILES_DIR_ENV]: other },
        persistentFilesDir
      )
    ).toBe(other);
    expect(inFrame(persistentFilesDir)).toBe(FILES_DIR);
  });
});
