import { detectSkillsFromGitHubRepo } from "@app/lib/api/skills/detection/github/detect_skills";
import { importSkillsFromGitHub } from "@app/lib/api/skills/detection/github/import_skills";
import type { GitHubDetectedSkill } from "@app/lib/api/skills/detection/github/types";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { setupSkillInstructionsMarkdownPipeline } from "@app/tests/utils/skill_instructions_html";
import { SKILL_NAME_MAX_LENGTH } from "@app/types/assistant/skill_configuration_constants";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

vi.mock(
  "@app/lib/api/skills/detection/github/detect_skills",
  async (importOriginal) => ({
    ...(await importOriginal()),
    detectSkillsFromGitHubRepo: vi.fn(),
  })
);

vi.mock("@app/lib/api/skills/icon_suggestion", () => ({
  getSkillIconSuggestion: vi.fn(async () => ({
    isOk: () => true,
    value: "sparkles",
  })),
}));

vi.mock("@app/lib/api/skills/detection/suggest_mcp_servers", () => ({
  suggestMCPServersForDetectedSkill: vi.fn(async () => []),
}));

setupSkillInstructionsMarkdownPipeline();

const REPO_URL = "https://github.com/acme/skills";

function makeDetectedSkill(
  name: string,
  skillMdPath: string
): GitHubDetectedSkill {
  return {
    name,
    skillMdPath,
    description: `Description of ${name}`,
    instructions: `Instructions of ${name}`,
    attachments: [],
  };
}

describe("importSkillsFromGitHub", () => {
  it("rejects the import before creating anything when two SKILL.md files share a name", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    vi.mocked(detectSkillsFromGitHubRepo).mockResolvedValue(
      new Ok([
        makeDetectedSkill("first-skill", "first-skill/SKILL.md"),
        makeDetectedSkill("shared-name", "roles/a/shared-name/SKILL.md"),
        makeDetectedSkill("shared-name", "roles/b/shared-name/SKILL.md"),
      ])
    );

    const result = await importSkillsFromGitHub(authenticator, {
      repoUrl: REPO_URL,
      names: ["first-skill", "shared-name"],
    });

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      throw new Error("Expected an error.");
    }
    expect(result.error.type).toBe("validation_error");
    expect(result.error.message).toContain(
      '"shared-name" (roles/a/shared-name/SKILL.md, roles/b/shared-name/SKILL.md)'
    );
    expect(
      await SkillResource.fetchByNames(authenticator, [
        "first-skill",
        "shared-name",
      ])
    ).toHaveLength(0);
  });

  it("reports duplicate names even when another selected name is invalid", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const tooLongName = "a".repeat(SKILL_NAME_MAX_LENGTH + 1);
    vi.mocked(detectSkillsFromGitHubRepo).mockResolvedValue(
      new Ok([
        makeDetectedSkill(tooLongName, "too-long/SKILL.md"),
        makeDetectedSkill("shared-name", "roles/a/shared-name/SKILL.md"),
        makeDetectedSkill("shared-name", "roles/b/shared-name/SKILL.md"),
      ])
    );

    const result = await importSkillsFromGitHub(authenticator, {
      repoUrl: REPO_URL,
      names: [tooLongName, "shared-name"],
    });

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      throw new Error("Expected an error.");
    }
    expect(result.error.type).toBe("validation_error");
    expect(result.error.message).toContain(
      '"shared-name" (roles/a/shared-name/SKILL.md, roles/b/shared-name/SKILL.md)'
    );
  });

  it("imports skills with distinct names", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    vi.mocked(detectSkillsFromGitHubRepo).mockResolvedValue(
      new Ok([
        makeDetectedSkill("first-skill", "first-skill/SKILL.md"),
        makeDetectedSkill("second-skill", "second-skill/SKILL.md"),
      ])
    );

    const result = await importSkillsFromGitHub(authenticator, {
      repoUrl: REPO_URL,
      names: ["first-skill", "second-skill"],
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      throw new Error("Expected success.");
    }
    expect(result.value.imported.map((skill) => skill.name).sort()).toEqual([
      "first-skill",
      "second-skill",
    ]);
  });
});
