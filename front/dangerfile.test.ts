import { beforeEach, describe, expect, it, vi } from "vitest";

const { danger, warn } = vi.hoisted(() => ({
  danger: {
    git: {
      modified_files: [] as string[],
      created_files: [] as string[],
      deleted_files: [] as string[],
      diffForFile: vi.fn().mockResolvedValue(null),
    },
    github: { issue: { labels: [] }, pr: { body: "" } },
  },
  warn: vi.fn(),
}));

vi.mock("danger", () => ({ danger, warn, fail: vi.fn() }));

describe("code-defined skill reindex reminder", () => {
  beforeEach(() => {
    vi.resetModules();
    warn.mockClear();
    danger.git.modified_files = [];
    danger.git.created_files = [];
    danger.git.deleted_files = [];
  });

  it.each([
    "modified_files",
    "created_files",
    "deleted_files",
  ] as const)("warns for %s definitions, including registry changes", async (kind) => {
    danger.git[kind] = [
      "front/lib/resources/skill/code_defined/global/index.ts",
    ];
    await import("./dangerfile");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("reindex_code_defined_skills.ts --execute")
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("each region"));
  });

  it("warns when the indexed projection changes", async () => {
    danger.git.modified_files = [
      "front/scripts/reindex_code_defined_skills.ts",
    ];
    await import("./dangerfile");
    expect(warn).toHaveBeenCalledOnce();
  });

  it("does not warn for standalone instructions or tests", async () => {
    danger.git.modified_files = [
      "front/lib/resources/skill/code_defined/global/pdf/instructions.md",
      "front/lib/resources/skill/code_defined/global_registry.test.ts",
    ];
    await import("./dangerfile");
    expect(warn).not.toHaveBeenCalled();
  });
});
