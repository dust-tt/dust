import { sandboxSkill } from "@app/lib/resources/skill/code_defined/sandbox";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
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

  it("hides agent egress request instructions until enabled", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});

    await FeatureFlagFactory.basic(auth, "sandbox_tools");

    const restrictedInstructions = await sandboxSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(restrictedInstructions).toContain("There is **no** way to add");
    expect(restrictedInstructions).not.toContain("add_egress_domain");

    const ws = await WorkspaceResource.fetchById(workspace.sId);
    await ws!.updateSandboxAllowAgentEgressRequests(true);

    const permissiveInstructions = await sandboxSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(permissiveInstructions).toContain("add_egress_domain");
    expect(permissiveInstructions).toContain("Sandbox allowlist");
  });
});
