import { sandboxSkill } from "@app/lib/resources/skill/code_defined/sandbox";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("sandboxSkill", () => {
  it("hides dsbx tools instructions and manifest entry until enabled", async () => {
    const { authenticator: auth } = await createResourceTest({});

    await FeatureFlagFactory.basic(auth, "sandbox_tools");

    const instructionsWithoutDsbxTools = await sandboxSkill.fetchInstructions(
      auth,
      { spaceIds: [] }
    );

    expect(instructionsWithoutDsbxTools).not.toContain("dsbx tools");
    expect(instructionsWithoutDsbxTools).not.toContain("name: dsbx");

    await FeatureFlagFactory.basic(auth, "sandbox_dsbx_tools");

    const instructionsWithDsbxTools = await sandboxSkill.fetchInstructions(
      auth,
      { spaceIds: [] }
    );

    expect(instructionsWithDsbxTools).toContain("dsbx tools");
    expect(instructionsWithDsbxTools).toContain("name: dsbx");
  });
});
