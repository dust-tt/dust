// @vitest-environment node: adm-zip requires Node builtins (Buffer, zlib)
// This directive makes them available in the test environment.

import {
  makeZipBombBuffer,
  spyOnInflatedBytes,
} from "@app/tests/utils/zip_bomb";
import { isString } from "@app/types/shared/utils/general";
import AdmZip from "adm-zip";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createZipAttachmentReader,
  detectSkillsFromZip,
  MAX_DECOMPRESSED_SIZE_BYTES,
  MAX_ZIP_ENTRIES,
} from "./detect_skills";

function makeSkillMd(name: string, description: string, body: string): string {
  return `---
name: ${name}
description: ${description}
---
${body}`;
}

function buildZipBuffer(files: Record<string, string | Buffer>): Buffer {
  const zip = new AdmZip();
  for (const [path, content] of Object.entries(files)) {
    if (isString(content)) {
      zip.addFile(path, Buffer.from(content, "utf-8"));
    } else {
      zip.addFile(path, content);
    }
  }
  return zip.toBuffer();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("detectSkillsFromZip", () => {
  test("detects skills from a valid ZIP", () => {
    const zipBuffer = buildZipBuffer({
      "skills/foo/SKILL.md": makeSkillMd("foo", "Foo skill", "Do foo."),
      "skills/bar/SKILL.md": makeSkillMd("bar", "Bar skill", "Do bar."),
    });

    const result = detectSkillsFromZip({ zipBuffer });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(2);
      const names = result.value.map((s) => s.name).sort();
      expect(names).toEqual(["bar", "foo"]);
      const foo = result.value.find((s) => s.name === "foo");
      expect(foo?.instructions).toBe("Do foo.");
    }
  });

  test("collects attachments alongside SKILL.md", () => {
    const zipBuffer = buildZipBuffer({
      "skills/foo/SKILL.md": makeSkillMd("foo", "Foo skill", "Do foo."),
      "skills/foo/helper.py": "print('hello')",
      "skills/foo/data/config.json": '{"key": "value"}',
    });

    const result = detectSkillsFromZip({ zipBuffer });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0].attachments).toHaveLength(2);
      expect(result.value[0].attachments.map((a) => a.path).sort()).toEqual([
        "foo/data/config.json",
        "foo/helper.py",
      ]);
    }
  });

  test("strips common top-level prefix (GitHub-style ZIP)", () => {
    const zipBuffer = buildZipBuffer({
      "repo-main/skills/foo/SKILL.md": makeSkillMd(
        "foo",
        "Foo skill",
        "Do foo."
      ),
    });

    const result = detectSkillsFromZip({ zipBuffer });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].skillMdPath).toBe("skills/foo/SKILL.md");
    }
  });

  test("detects repository root skill alongside nested skills", () => {
    const zipBuffer = buildZipBuffer({
      "repo-main/SKILL.md": makeSkillMd("root", "Root skill", "Do root work."),
      "repo-main/README.md": "# Root readme",
      "repo-main/skills/foo/SKILL.md": makeSkillMd(
        "foo",
        "Foo skill",
        "Do foo."
      ),
      "repo-main/skills/foo/helper.py": "print('hello')",
    });

    const result = detectSkillsFromZip({ zipBuffer });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.map((s) => s.name)).toEqual(["root", "foo"]);
      expect(result.value[0].skillMdPath).toBe("repo-main/SKILL.md");
      expect(result.value[0].attachments).toEqual([
        {
          path: "repo-main/README.md",
          sizeBytes: 13,
          contentType: "text/markdown",
          originalEntryName: "repo-main/README.md",
        },
      ]);
    }
  });

  test("detects a single skill directory at the top level", () => {
    const zipBuffer = buildZipBuffer({
      "my-skill/SKILL.md": makeSkillMd("foo", "Foo skill", "Do foo."),
      "my-skill/helper.py": "print('hello')",
    });

    const result = detectSkillsFromZip({ zipBuffer });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].name).toBe("foo");
      expect(result.value[0].skillMdPath).toBe("my-skill/SKILL.md");
      expect(result.value[0].attachments).toEqual([
        {
          path: "my-skill/helper.py",
          sizeBytes: 14,
          contentType: "text/x-python",
          originalEntryName: "my-skill/helper.py",
        },
      ]);
    }
  });

  test("returns empty array when no SKILL.md files found", () => {
    const zipBuffer = buildZipBuffer({
      "README.md": "# Hello",
      "src/index.ts": "console.log('hi')",
    });

    const result = detectSkillsFromZip({ zipBuffer });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([]);
    }
  });

  test("skips skills with invalid or missing frontmatter", () => {
    const zipBuffer = buildZipBuffer({
      "skills/valid/SKILL.md": makeSkillMd(
        "valid",
        "Valid skill",
        "Instructions."
      ),
      "skills/invalid/SKILL.md": "No frontmatter here.",
    });

    const result = detectSkillsFromZip({ zipBuffer });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].name).toBe("valid");
    }
  });

  test("does not deduplicate skills with same name", () => {
    const zipBuffer = buildZipBuffer({
      "skills/foo-v1/SKILL.md": makeSkillMd("foo", "First foo", "First."),
      "skills/foo-v2/SKILL.md": makeSkillMd("foo", "Second foo", "Second."),
    });

    const result = detectSkillsFromZip({ zipBuffer });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(2);
    }
  });

  test("rejects a zip whose entry count exceeds the cap", () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < MAX_ZIP_ENTRIES + 1; i++) {
      files[`file-${i}.txt`] = "x";
    }

    const result = detectSkillsFromZip({ zipBuffer: buildZipBuffer(files) });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("too many entries");
    }
  });

  test("does not inflate an entry declaring a size of 0", () => {
    const zipBuffer = makeZipBombBuffer(
      "skills/foo/SKILL.md",
      2 * MAX_DECOMPRESSED_SIZE_BYTES
    );
    const inflated = spyOnInflatedBytes();

    const result = detectSkillsFromZip({ zipBuffer });
    expect(result.isOk()).toBe(true);
    expect(inflated.total).toBe(0);
  });

  test("detects a small archive with more than 50 skill directories", () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 51; i++) {
      files[`skills/skill-${i}/SKILL.md`] = makeSkillMd(
        `skill-${i}`,
        "A skill",
        "Do the thing."
      );
    }

    const result = detectSkillsFromZip({ zipBuffer: buildZipBuffer(files) });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(51);
    }
  });

  test("returns error for invalid ZIP data", () => {
    const result = detectSkillsFromZip({
      zipBuffer: Buffer.from("not a zip file"),
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Failed to open ZIP");
    }
  });
});

describe("createZipAttachmentReader", () => {
  test("does not inflate an entry declaring a size of 0", () => {
    const zipBuffer = makeZipBombBuffer(
      "skills/foo/data.txt",
      2 * MAX_DECOMPRESSED_SIZE_BYTES
    );
    const inflated = spyOnInflatedBytes();

    const readerResult = createZipAttachmentReader(zipBuffer);
    expect(readerResult.isOk()).toBe(true);
    if (readerResult.isOk()) {
      const readResult = readerResult.value("skills/foo/data.txt");
      expect(readResult.isOk()).toBe(true);
    }
    expect(inflated.total).toBe(0);
  });
});
