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

  it("treats --help as literal text when editing", () => {
    const filePath = path.join(tempDir, "help-literal.txt");
    fs.writeFileSync(filePath, "--help\n");
    const { exitCode } = runBashFunction(
      `edit_file "--help" "updated" "${filePath}"`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("updated\n");
  });

  it("rejects multiple files in anthropic profile", () => {
    const file1 = path.join(tempDir, "file1.txt");
    const file2 = path.join(tempDir, "file2.txt");
    fs.writeFileSync(file1, "hello world\n");
    fs.writeFileSync(file2, "hello there\n");
    const { stderr, exitCode } = runBashFunction(
      `edit_file "hello" "goodbye" "${file1}" "${file2}"`,
      tempDir
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("one file at a time (use --edits-json");
  });

  it("edits multiple files with gemini profile", () => {
    const file1 = path.join(tempDir, "file1.txt");
    const file2 = path.join(tempDir, "file2.txt");
    fs.writeFileSync(file1, "hello world\n");
    fs.writeFileSync(file2, "hello there\n");
    const { stdout, exitCode } = runBashFunction(
      `edit_file "hello" "goodbye" "${file1}" "${file2}"`,
      tempDir,
      "gemini"
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain(`Edited ${file1}`);
    expect(stdout).toContain(`Edited ${file2}`);
    expect(fs.readFileSync(file1, "utf-8")).toBe("goodbye world\n");
    expect(fs.readFileSync(file2, "utf-8")).toBe("goodbye there\n");
  });

  it("continues editing remaining files when one fails (gemini)", () => {
    const file1 = path.join(tempDir, "file1.txt");
    const file2 = path.join(tempDir, "file2.txt");
    fs.writeFileSync(file1, "no match here\n");
    fs.writeFileSync(file2, "hello world\n");
    const { stdout, stderr, exitCode } = runBashFunction(
      `edit_file "hello" "goodbye" "${file1}" "${file2}"`,
      tempDir,
      "gemini"
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain(`old_text not found in ${file1}`);
    expect(stdout).toContain(`Edited ${file2}`);
    expect(fs.readFileSync(file2, "utf-8")).toBe("goodbye world\n");
  });

  describe("validation", () => {
    it("rejects empty files", () => {
      const filePath = path.join(tempDir, "empty.txt");
      fs.writeFileSync(filePath, "");
      const result = runBashFunction(
        `edit_file "old" "new" "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("file is empty");
    });

    it("rejects file with null bytes as binary", () => {
      const filePath = path.join(tempDir, "nullbyte.txt");
      fs.writeFileSync(filePath, Buffer.from("hello\x00world\n"));
      const result = runBashFunction(
        `edit_file "hello" "bye" "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("binary file");
    });
  });

  it("handles multiline edits", () => {
    const filePath = path.join(tempDir, "multi.txt");
    fs.writeFileSync(filePath, "before\nline1\nline2\nafter\n");
    const result = runBashFunction(
      `edit_file $'line1\\nline2' $'new1\\nnew2\\nnew3' "${filePath}"`,
      tempDir
    );
    expect(result.exitCode).toBe(0);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(
      "before\nnew1\nnew2\nnew3\nafter\n"
    );
  });

  it("matches straight quotes against curly quotes and preserves quote style", () => {
    const doubleQuotesPath = path.join(tempDir, "curly-double.txt");
    fs.writeFileSync(doubleQuotesPath, "\u201chello world\u201d\n");

    const doubleResult = runBashFunction(
      `edit_file '"hello world"' '"goodbye world"' "${doubleQuotesPath}"`,
      tempDir
    );
    expect(doubleResult.exitCode).toBe(0);
    expect(doubleResult.stdout).toContain("quote normalization");
    expect(fs.readFileSync(doubleQuotesPath, "utf-8")).toBe(
      "\u201cgoodbye world\u201d\n"
    );

    const singleQuotesPath = path.join(tempDir, "curly-single.txt");
    fs.writeFileSync(singleQuotesPath, "\u2018hello\u2019\n");
    const singleResult = runBashFunction(
      `edit_file "'hello'" "'goodbye'" "${singleQuotesPath}"`,
      tempDir
    );
    expect(singleResult.exitCode).toBe(0);
    expect(fs.readFileSync(singleQuotesPath, "utf-8")).toBe(
      "\u2018goodbye\u2019\n"
    );
  });

  describe("smart delete", () => {
    it("removes trailing newline when deleting a line", () => {
      const filePath = path.join(tempDir, "smartdel.txt");
      fs.writeFileSync(filePath, "line1\ndebug_line\nline3\n");
      const result = runBashFunction(
        `edit_file "debug_line" "" "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(0);
      expect(fs.readFileSync(filePath, "utf-8")).toBe("line1\nline3\n");
    });

    it("does not remove newline when old_text already ends with newline", () => {
      const filePath = path.join(tempDir, "smartdel2.txt");
      fs.writeFileSync(filePath, "line1\ndebug_line\nline3\n");
      const result = runBashFunction(
        `edit_file $'debug_line\\n' "" "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(0);
      expect(fs.readFileSync(filePath, "utf-8")).toBe("line1\nline3\n");
    });
  });

  describe("trailing whitespace", () => {
    it("strips trailing whitespace from new_text", () => {
      const filePath = path.join(tempDir, "ws.txt");
      fs.writeFileSync(filePath, "hello world\n");
      const result = runBashFunction(
        `edit_file "hello" "goodbye   " "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(0);
      expect(fs.readFileSync(filePath, "utf-8")).toBe("goodbye world\n");
    });

    it("preserves trailing whitespace in markdown files", () => {
      const filePath = path.join(tempDir, "doc.md");
      fs.writeFileSync(filePath, "hello world\n");
      const result = runBashFunction(
        `edit_file "hello" "goodbye  " "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(0);
      expect(fs.readFileSync(filePath, "utf-8")).toBe("goodbye   world\n");
    });
  });

  describe("replace-all", () => {
    it("replaces all occurrences with --replace-all", () => {
      const filePath = path.join(tempDir, "replall.txt");
      fs.writeFileSync(filePath, "foo bar\nfoo baz\nfoo qux\n");
      const result = runBashFunction(
        `edit_file --replace-all "foo" "replaced" "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(0);
      expect(fs.readFileSync(filePath, "utf-8")).toBe(
        "replaced bar\nreplaced baz\nreplaced qux\n"
      );
    });

    it("rejects multiple matches without --replace-all", () => {
      const filePath = path.join(tempDir, "replall2.txt");
      fs.writeFileSync(filePath, "foo bar\nfoo baz\n");
      const result = runBashFunction(
        `edit_file "foo" "bar" "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("matches 2 times");
    });
  });

  describe("diff output", () => {
    it("keeps no-trailing-newline diffs readable and annotated", () => {
      const filePath = path.join(tempDir, "no-newline-diff.txt");
      fs.writeFileSync(filePath, "Update timestamp: 1");
      const result = runBashFunction(
        `edit_file "Update timestamp" "End timestamp" "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain(
        "-Update timestamp: 1\n+End timestamp: 1"
      );
      expect(result.stderr).toContain("[No trailing newline in original file]");
      expect(result.stderr).toContain("[No trailing newline in updated file]");
    });

    it("truncates very large diffs", () => {
      const filePath = path.join(tempDir, "big-diff.txt");
      const lines = Array.from({ length: 2000 }, () => "foo");
      fs.writeFileSync(filePath, lines.join("\n") + "\n");
      const result = runBashFunction(
        `edit_file --replace-all "foo" "bar" "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("[Diff truncated after");
    });
  });

  it("writes sanitized replacement text literally after desanitized matching", () => {
    const filePath = path.join(tempDir, "sanitized.txt");
    fs.writeFileSync(filePath, "<system>old</system>\n");
    const result = runBashFunction(
      `edit_file "<s>old</s>" "<s>new</s>" "${filePath}"`,
      tempDir
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("desanitization");
    expect(fs.readFileSync(filePath, "utf-8")).toBe("<s>new</s>\n");
  });
});
