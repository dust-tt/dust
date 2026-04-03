import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir, runBashFunction } from "./_test_utils";

describe("_dust_truncate", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("passes through output under limit", () => {
    const { stdout } = runBashFunction(
      'echo -e "line1\\nline2\\nline3" | _dust_truncate 10',
      tempDir
    );
    expect(stdout).toBe("line1\nline2\nline3");
  });

  it("truncates output over limit keeping tail", () => {
    const { stdout } = runBashFunction(
      'echo -e "1\\n2\\n3\\n4\\n5" | _dust_truncate 3',
      tempDir
    );
    expect(stdout).toContain("[... 2 lines truncated ...]");
    expect(stdout).toContain("3\n4\n5");
  });
});

describe("_dust_truncate_chars", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("passes through output under character limit", () => {
    const { stdout } = runBashFunction(
      'echo "short text" | _dust_truncate_chars',
      tempDir
    );
    expect(stdout).toBe("short text");
  });

  it("truncates output over limit and writes full output to file", () => {
    // Generate 60000 chars (exceeds 50000 limit)
    const { stdout } = runBashFunction(
      'head -c 60000 /dev/zero | tr "\\0" "a" | _dust_truncate_chars',
      tempDir
    );
    expect(stdout).toContain(
      "[Output too long (60000 chars). Showing last 50000 chars only."
    );
    expect(stdout).toContain("/tmp/shell_output_");
    expect(stdout).toContain("[BEGIN TAIL]");
    expect(stdout).toContain("[END TAIL]");
  });

  it("creates file with full output when truncated", () => {
    const { stdout } = runBashFunction(
      `
      output=$(head -c 60000 /dev/zero | tr "\\0" "b" | _dust_truncate_chars)
      file_path=$(echo "$output" | grep -o '/tmp/shell_output_[0-9]*\\.txt' | head -1)
      if [[ -f "$file_path" ]]; then
        wc -c < "$file_path" | tr -d ' '
      else
        echo "FILE_NOT_FOUND"
      fi
      `,
      tempDir
    );
    expect(stdout.trim()).toBe("60001"); // 60000 chars + newline from echo
  });
});
