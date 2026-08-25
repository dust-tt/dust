import { goDeepSkill } from "@app/lib/resources/skill/code_defined/global/go_deep";
import { describe, expect, it } from "vitest";

describe("goDeepSkill", () => {
  it("reserves activation for explicit deep research requests", () => {
    expect(goDeepSkill.agentFacingDescription).toContain(
      "only when the user explicitly asks to use Go Deep"
    );
    expect(goDeepSkill.agentFacingDescription).toContain(
      "asks for a deep dive or deep research"
    );
    expect(goDeepSkill.agentFacingDescription).toContain(
      "Do not infer that Go Deep is needed from task complexity alone"
    );
    expect(goDeepSkill.agentFacingDescription).toContain(
      "When in doubt, do not enable it"
    );
    expect(goDeepSkill.agentFacingDescription).not.toContain("more than 3");
    expect(goDeepSkill.agentFacingDescription).not.toContain(
      "When in doubt, prefer enabling"
    );
  });
});
