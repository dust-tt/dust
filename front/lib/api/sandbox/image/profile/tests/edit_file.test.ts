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

  it("handles text starting with single dash", () => {
    const filePath = path.join(tempDir, "dash.txt");
    fs.writeFileSync(filePath, "- Updated the timestamp\n");
    const { exitCode } = runBashFunction(
      `edit_file "- Updated the timestamp" "- Fixed timestamp" "${filePath}"`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("- Fixed timestamp\n");
  });

  it("handles text starting with double dash", () => {
    const filePath = path.join(tempDir, "doubledash.txt");
    fs.writeFileSync(filePath, "-- CONFIG_VALUE=true\n");
    const { exitCode } = runBashFunction(
      `edit_file "-- CONFIG_VALUE=true" "-- CONFIG_VALUE=false" "${filePath}"`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("-- CONFIG_VALUE=false\n");
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
    expect(stdout).toContain("edit_file [--replace-all]");
  });

  it("error includes usage hint", () => {
    const { stderr, exitCode } = runBashFunction("edit_file", tempDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage:");
    expect(stderr).toContain("--help");
  });

  describe("validation", () => {
    it("rejects binary PNG file", () => {
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
      ]);
      const pngPath = path.join(tempDir, "image.png");
      fs.writeFileSync(pngPath, pngBuffer);
      const result = runBashFunction(
        `edit_file "old" "new" "${pngPath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("binary file");
    });

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
  });

  describe("regression", () => {
    it("handles old_text as substring of new_text", () => {
      const filePath = path.join(tempDir, "substring.txt");
      fs.writeFileSync(filePath, "foo bar\n");
      const result = runBashFunction(
        `edit_file "foo" "foobar" "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(0);
      expect(fs.readFileSync(filePath, "utf-8")).toBe("foobar bar\n");
    });

    it("detects duplicates on the same line", () => {
      const filePath = path.join(tempDir, "sameline.txt");
      fs.writeFileSync(filePath, "foo foo bar\n");
      const result = runBashFunction(
        `edit_file "foo" "baz" "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("matches 2 times");
    });
  });

  describe("coverage", () => {
    it("removes text when new_text is empty", () => {
      const filePath = path.join(tempDir, "delete.txt");
      fs.writeFileSync(filePath, "keep debug remove\n");
      const result = runBashFunction(
        `edit_file "debug " "" "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(0);
      expect(fs.readFileSync(filePath, "utf-8")).toBe("keep remove\n");
    });

    it("handles multiline old_text", () => {
      const filePath = path.join(tempDir, "multi.txt");
      fs.writeFileSync(filePath, "line1\nline2\nline3\n");
      const result = runBashFunction(
        `edit_file $'line1\\nline2' "replaced" "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(0);
      expect(fs.readFileSync(filePath, "utf-8")).toBe("replaced\nline3\n");
    });

    it("handles multiline new_text", () => {
      const filePath = path.join(tempDir, "expand.txt");
      fs.writeFileSync(filePath, "before\noriginal\nafter\n");
      const result = runBashFunction(
        `edit_file "original" $'new1\\nnew2\\nnew3' "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(0);
      expect(fs.readFileSync(filePath, "utf-8")).toBe(
        "before\nnew1\nnew2\nnew3\nafter\n"
      );
    });

    it("treats regex metacharacters as literal text", () => {
      const filePath = path.join(tempDir, "regex.txt");
      fs.writeFileSync(filePath, "price = $100 + tax.*\n");
      const result = runBashFunction(
        `edit_file 'price = $100 + tax.*' 'cost = 50' "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(0);
      expect(fs.readFileSync(filePath, "utf-8")).toBe("cost = 50\n");
    });
  });

  describe("edge cases", () => {
    it("replaces when old_text is entire file content", () => {
      const filePath = path.join(tempDir, "whole.txt");
      fs.writeFileSync(filePath, "hello");
      const result = runBashFunction(
        `edit_file "hello" "world" "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(0);
      expect(fs.readFileSync(filePath, "utf-8")).toBe("world");
    });

    it("handles old_text containing new_text", () => {
      const filePath = path.join(tempDir, "inverse.txt");
      fs.writeFileSync(filePath, "foobar baz\n");
      const result = runBashFunction(
        `edit_file "foobar" "foo" "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(0);
      expect(fs.readFileSync(filePath, "utf-8")).toBe("foo baz\n");
    });

    it("handles single-character file", () => {
      const filePath = path.join(tempDir, "single.txt");
      fs.writeFileSync(filePath, "x");
      const result = runBashFunction(
        `edit_file "x" "y" "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(0);
      expect(fs.readFileSync(filePath, "utf-8")).toBe("y");
    });

    it("does not count old_text appearing in file path", () => {
      const subDir = path.join(tempDir, "foo");
      fs.mkdirSync(subDir);
      const filePath = path.join(subDir, "test.txt");
      fs.writeFileSync(filePath, "foo is here\n");
      const result = runBashFunction(
        `edit_file "foo" "bar" "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(0);
      expect(fs.readFileSync(filePath, "utf-8")).toBe("bar is here\n");
    });

    it("produces empty file when smart-deleting all content", () => {
      const filePath = path.join(tempDir, "wipe.txt");
      fs.writeFileSync(filePath, "all content\n");
      const result = runBashFunction(
        `edit_file "all content" "" "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(0);
      expect(fs.readFileSync(filePath, "utf-8")).toBe("");
    });

    it("rejects file with null bytes as binary", () => {
      const filePath = path.join(tempDir, "nullbyte.txt");
      const buf = Buffer.from("hello\x00world\n");
      fs.writeFileSync(filePath, buf);
      const result = runBashFunction(
        `edit_file "hello" "bye" "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("binary file");
    });
  });

  describe("quote normalization", () => {
    it("matches curly double quotes in file with straight quotes in old_text", () => {
      const filePath = path.join(tempDir, "curly.txt");
      fs.writeFileSync(filePath, "\u201chello world\u201d\n");
      const result = runBashFunction(
        `edit_file '"hello world"' '"goodbye world"' "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("quote normalization");
      expect(fs.readFileSync(filePath, "utf-8")).toBe(
        "\u201cgoodbye world\u201d\n"
      );
    });

    it("matches curly single quotes in file with straight quotes in old_text", () => {
      const filePath = path.join(tempDir, "curly_single.txt");
      fs.writeFileSync(filePath, "\u2018hello\u2019\n");
      const result = runBashFunction(
        `edit_file "'hello'" "'goodbye'" "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(0);
      expect(fs.readFileSync(filePath, "utf-8")).toBe("\u2018goodbye\u2019\n");
    });
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
    it("outputs unified diff on stderr", () => {
      const filePath = path.join(tempDir, "diff.txt");
      fs.writeFileSync(filePath, "hello world\n");
      const result = runBashFunction(
        `edit_file "hello" "goodbye" "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("-hello world");
      expect(result.stderr).toContain("+goodbye world");
    });
  });

  // Verification tests
  describe("verification", () => {
    it("preserves trailing newlines", () => {
      const filePath = path.join(tempDir, "with-newline.txt");
      fs.writeFileSync(filePath, "old content\n");
      runBashFunction(`edit_file "old" "new" "${filePath}"`, tempDir);
      expect(fs.readFileSync(filePath, "utf-8")).toBe("new content\n");
    });

    it("preserves missing trailing newlines", () => {
      const filePath = path.join(tempDir, "no-newline.txt");
      fs.writeFileSync(filePath, "old content");
      runBashFunction(`edit_file "old" "new" "${filePath}"`, tempDir);
      expect(fs.readFileSync(filePath, "utf-8")).toBe("new content");
    });

    it("verifies replacement succeeded", () => {
      const filePath = path.join(tempDir, "test.txt");
      fs.writeFileSync(filePath, "old content\n");
      const result = runBashFunction(
        `edit_file "old" "new" "${filePath}"`,
        tempDir
      );
      expect(result.exitCode).toBe(0);
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("new");
      expect(content).not.toContain("old");
    });
  });
});
