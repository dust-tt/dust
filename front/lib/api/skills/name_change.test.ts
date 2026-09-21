import { validateSkillNameChange } from "@app/lib/api/skills/name_change";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SKILL_NAME_MAX_LENGTH } from "@app/types/assistant/skill_configuration_constants";
import { describe, expect, it } from "vitest";

describe("validateSkillNameChange", () => {
  it("rejects a raw name over the maximum length even when its trimmed form fits", async () => {
    const { authenticator } = await createResourceTest({ role: "user" });
    const skill = await SkillFactory.create(authenticator, { name: "Old" });

    const result = await validateSkillNameChange(authenticator, skill, {
      name: `${"a".repeat(SKILL_NAME_MAX_LENGTH)} `,
    });

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      throw new Error("Expected an error.");
    }
    expect(result.error.code).toBe("too_long");
  });

  it("accepts a name within bounds and trims it", async () => {
    const { authenticator } = await createResourceTest({ role: "user" });
    const skill = await SkillFactory.create(authenticator, { name: "Old" });

    const result = await validateSkillNameChange(authenticator, skill, {
      name: "  New Name  ",
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      throw new Error("Expected success.");
    }
    expect(result.value.name).toBe("New Name");
  });
});
