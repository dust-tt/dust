import * as fs from "fs";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir, runTool } from "./_test_utils";

describe("write_file", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("creates parent directories", async () => {
    const filePath = path.join(tempDir, "nested", "deep", "file.txt");
    const { exitCode } = await runTool("write_file", [filePath, "content"]);
    expect(exitCode).toBe(0);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("content");
  });
});
