import * as fs from "fs";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir, runBashFunction } from "./_test_utils";

describe("edit_file", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    fs.writeFileSync(path.join(tempDir, "edit.txt"), "hello world\nfoo bar\n");
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("replaces unique match", () => {
    const filePath = path.join(tempDir, "edit.txt");
    const { stdout, exitCode } = runBashFunction(
      `edit_file "hello" "goodbye" "${filePath}"`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Edited");
    expect(fs.readFileSync(filePath, "utf-8")).toBe("goodbye world\nfoo bar\n");
  });

  it("errors when old_text not found", () => {
    const filePath = path.join(tempDir, "edit.txt");
    const { stderr, exitCode } = runBashFunction(
      `edit_file "nonexistent" "replacement" "${filePath}"`,
      tempDir
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("old_text not found");
  });

  it("errors when old_text matches multiple times", () => {
    const filePath = path.join(tempDir, "multi.txt");
    fs.writeFileSync(filePath, "foo\nfoo\nbar\n");
    const { stderr, exitCode } = runBashFunction(
      `edit_file "foo" "baz" "${filePath}"`,
      tempDir
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("matches 2 times");
  });

  it("handles special characters", () => {
    const filePath = path.join(tempDir, "special.txt");
    fs.writeFileSync(filePath, 'const x = "value";\n');
    const { exitCode } = runBashFunction(
      `edit_file '"value"' '"newValue"' "${filePath}"`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(fs.readFileSync(filePath, "utf-8")).toBe('const x = "newValue";\n');
  });

  it("edits multiple files with same replacement", () => {
    const file1 = path.join(tempDir, "file1.txt");
    const file2 = path.join(tempDir, "file2.txt");
    fs.writeFileSync(file1, "hello world\n");
    fs.writeFileSync(file2, "hello there\n");
    const { stdout, exitCode } = runBashFunction(
      `edit_file "hello" "goodbye" "${file1}" "${file2}"`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain(`Edited ${file1}`);
    expect(stdout).toContain(`Edited ${file2}`);
    expect(fs.readFileSync(file1, "utf-8")).toBe("goodbye world\n");
    expect(fs.readFileSync(file2, "utf-8")).toBe("goodbye there\n");
  });

  it("continues editing remaining files when one file fails", () => {
    const file1 = path.join(tempDir, "file1.txt");
    const file2 = path.join(tempDir, "file2.txt");
    fs.writeFileSync(file1, "no match here\n");
    fs.writeFileSync(file2, "hello world\n");
    const { stdout, stderr, exitCode } = runBashFunction(
      `edit_file "hello" "goodbye" "${file1}" "${file2}"`,
      tempDir
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain(`old_text not found in ${file1}`);
    expect(stdout).toContain(`Edited ${file2}`);
    expect(fs.readFileSync(file2, "utf-8")).toBe("goodbye world\n");
  });

  it("returns help with --help flag", () => {
    const { stdout, exitCode } = runBashFunction("edit_file --help", tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("edit_file <old_text> <new_text> <path1>");
  });

  it("error includes usage hint", () => {
    const { stderr, exitCode } = runBashFunction("edit_file", tempDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage:");
    expect(stderr).toContain("--help");
  });
});
