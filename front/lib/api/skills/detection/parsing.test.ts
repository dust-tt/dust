import { describe, expect, test } from "vitest";

import {
  collectAttachments,
  findSkillDirectories,
  parseSkillMarkdown,
} from "./parsing";
import type { FileEntry } from "./types";

describe("parseSkillMarkdown", () => {
  test("extracts name, description and instructions from valid frontmatter", () => {
    const md = `---
name: my-skill
description: A great skill
---
Do stuff here.`;

    const result = parseSkillMarkdown(md);
    expect(result.name).toBe("my-skill");
    expect(result.description).toBe("A great skill");
    expect(result.instructions).toBe("Do stuff here.");
  });

  test("returns empty name/description when frontmatter is missing", () => {
    const md = "# Just a markdown file\nNo frontmatter.";

    const result = parseSkillMarkdown(md);
    expect(result.name).toBe("");
    expect(result.description).toBe("");
    expect(result.instructions).toBe(md);
  });

  test("returns empty name/description when frontmatter is malformed YAML", () => {
    const md = `---
: invalid: yaml: [
---
Body here.`;

    const result = parseSkillMarkdown(md);
    expect(result.name).toBe("");
    expect(result.instructions).toBe("Body here.");
  });

  test("returns empty name/description when frontmatter has no closing delimiter", () => {
    const md = `---
name: incomplete
No closing delimiter.`;

    const result = parseSkillMarkdown(md);
    expect(result.name).toBe("");
    expect(result.instructions).toBe(md);
  });

  test("trims leading whitespace from body", () => {
    const md = `---
name: test
description: test desc
---


Some instructions.`;

    const result = parseSkillMarkdown(md);
    expect(result.instructions).toBe("Some instructions.");
  });
});

describe("findSkillDirectories", () => {
  test("finds SKILL.md in subdirectories", () => {
    const entries: FileEntry[] = [
      { path: "skills/foo/SKILL.md", isFile: true, sizeBytes: 100 },
      { path: "skills/bar/skill.md", isFile: true, sizeBytes: 200 },
      { path: "skills/baz/README.md", isFile: true, sizeBytes: 50 },
    ];

    const dirs = findSkillDirectories(entries);
    expect(dirs).toHaveLength(2);
    expect(dirs[0]).toEqual({
      dirPath: "skills/foo",
      skillMdPath: "skills/foo/SKILL.md",
    });
    expect(dirs[1]).toEqual({
      dirPath: "skills/bar",
      skillMdPath: "skills/bar/skill.md",
    });
  });

  test("skips SKILL.md at the root", () => {
    const entries: FileEntry[] = [
      { path: "SKILL.md", isFile: true, sizeBytes: 100 },
      { path: "sub/SKILL.md", isFile: true, sizeBytes: 100 },
    ];

    const dirs = findSkillDirectories(entries);
    expect(dirs).toHaveLength(1);
    expect(dirs[0].skillMdPath).toBe("sub/SKILL.md");
  });

  test("deduplicates directories with both skill.md and SKILL.md", () => {
    const entries: FileEntry[] = [
      { path: "skills/foo/SKILL.md", isFile: true, sizeBytes: 100 },
      { path: "skills/foo/skill.md", isFile: true, sizeBytes: 100 },
    ];

    const dirs = findSkillDirectories(entries);
    expect(dirs).toHaveLength(1);
  });

  test("skips directory entries", () => {
    const entries: FileEntry[] = [
      { path: "skills/foo", isFile: false, sizeBytes: 0 },
      { path: "skills/foo/SKILL.md", isFile: true, sizeBytes: 100 },
    ];

    const dirs = findSkillDirectories(entries);
    expect(dirs).toHaveLength(1);
  });
});

describe("collectAttachments", () => {
  const entries: FileEntry[] = [
    { path: "skills/foo/SKILL.md", isFile: true, sizeBytes: 100 },
    { path: "skills/foo/helper.py", isFile: true, sizeBytes: 500 },
    { path: "skills/foo/data/config.json", isFile: true, sizeBytes: 200 },
    { path: "skills/bar/SKILL.md", isFile: true, sizeBytes: 100 },
    { path: "other/file.txt", isFile: true, sizeBytes: 50 },
  ];

  test("collects files in the skill directory excluding SKILL.md", () => {
    const attachments = collectAttachments(entries, {
      dirPath: "skills/foo",
      skillMdPath: "skills/foo/SKILL.md",
    });

    expect(attachments).toEqual([
      { path: "helper.py", sizeBytes: 500 },
      { path: "data/config.json", sizeBytes: 200 },
    ]);
  });

  test("returns empty array when no attachments exist", () => {
    const attachments = collectAttachments(entries, {
      dirPath: "skills/bar",
      skillMdPath: "skills/bar/SKILL.md",
    });

    expect(attachments).toEqual([]);
  });
});
