import { goDeepSkill } from "@app/lib/resources/skill/code_defined/global/go_deep";
import { describe, expect, it } from "vitest";

describe("goDeepSkill", () => {
  it("reserves activation for broad, decomposable research", () => {
    expect(goDeepSkill.agentFacingDescription).toContain(
      "multiple independent research threads"
    );
    expect(goDeepSkill.agentFacingDescription).toContain(
      "Always use when the user explicitly requests the Go Deep skill"
    );
    expect(goDeepSkill.agentFacingDescription).toContain(
      "Do not use merely because the response should be detailed"
    );
    expect(goDeepSkill.agentFacingDescription).toContain(
      "If uncertain, do not enable it"
    );
    expect(goDeepSkill.agentFacingDescription).not.toContain("more than 3");
    expect(goDeepSkill.agentFacingDescription).not.toContain(
      "When in doubt, prefer enabling"
    );
  });
});
