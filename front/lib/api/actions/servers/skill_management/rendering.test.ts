import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { describe, expect, it } from "vitest";

import {
  getEnableSkillIdFromOutputBlock,
  makeEnableSkillInstructionsMarker,
} from "./rendering";

describe("enable skill instructions marker", () => {
  it("stores the skill id under _meta before MCP normalization", () => {
    const marker = makeEnableSkillInstructionsMarker("skill_123");

    expect(marker).toEqual({
      type: "resource",
      resource: {
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.TOOL_MARKER,
        uri: "",
        text: "enable_skill_instructions",
        _meta: {
          skillId: "skill_123",
        },
      },
    });
  });

  it("reads the normalized stored format after MCP tool processing", () => {
    const marker = {
      type: "resource" as const,
      resource: {
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.TOOL_MARKER,
        uri: "",
        text: "enable_skill_instructions",
        skillId: "skill_123",
      },
    };

    expect(getEnableSkillIdFromOutputBlock(marker)).toBe("skill_123");
  });
});
