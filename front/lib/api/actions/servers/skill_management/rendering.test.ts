import { describe, expect, it } from "vitest";

import {
  getEnableSkillIdFromOutputBlock,
  makeEnableSkillResultOutput,
} from "./rendering";

describe("enable skill result output", () => {
  it("stores the rendered text and skill id in a single structured block", () => {
    const output = makeEnableSkillResultOutput({
      skillId: "skill_123",
      text: 'Skill "commit" has been enabled.',
    });

    expect(output).toEqual({
      type: "resource",
      resource: {
        mimeType: "application/vnd.dust.tool-output.enable-skill-result",
        uri: "",
        text: 'Skill "commit" has been enabled.',
        skillId: "skill_123",
      },
    });
  });

  it("reads the skill id from the structured block", () => {
    const output = makeEnableSkillResultOutput({
      skillId: "skill_123",
      text: 'Skill "commit" has been enabled.',
    });

    expect(getEnableSkillIdFromOutputBlock(output)).toBe("skill_123");
  });
});
