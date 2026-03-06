import AdmZip from "adm-zip";
import { describe, expect, test } from "vitest";
import { detectSkillsFromZip } from "./detect_skills";

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
    if (typeof content === "string") {
      zip.addFile(path, Buffer.from(content, "utf-8"));
    } else {
      zip.addFile(path, content);
    }
  }
  return zip.toBuffer();
}

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
        "data/config.json",
        "helper.py",
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

  test("returns error for invalid ZIP data", () => {
    const result = detectSkillsFromZip({
      zipBuffer: Buffer.from("not a zip file"),
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("invalid_zip");
    }
  });
});
