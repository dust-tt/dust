import { describe, expect, it } from "vitest";

import {
  isSkillAuthoringResultOutput,
  makeSkillAuthoringResultOutput,
} from "./rendering";

describe("skill authoring result output", () => {
  it("stores skill authoring metadata in a structured block", () => {
    const output = makeSkillAuthoringResultOutput({
      operation: "create",
      skillId: "skl_123",
      skillName: "Write Updates",
      text: 'Created skill "Write Updates".',
      workspaceId: "w_123",
    });

    expect(output).toEqual({
      type: "resource",
      resource: {
        mimeType: "application/vnd.dust.tool-output.skill-authoring-result",
        uri: "",
        text: 'Created skill "Write Updates".',
        operation: "create",
        skillId: "skl_123",
        skillName: "Write Updates",
        url: "/w/w_123/builder/skills/skl_123",
      },
    });
    expect(isSkillAuthoringResultOutput(output)).toBe(true);
  });
});
