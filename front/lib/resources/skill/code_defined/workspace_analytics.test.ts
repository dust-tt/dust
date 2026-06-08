import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("workspace-analytics code-defined skill", () => {
  it("is hidden from non-admins even when the flag is on", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });
    await FeatureFlagFactory.basic(authenticator, "workspace_analytics");

    const skill = await GlobalSkillsRegistry.getById(
      authenticator,
      "workspace-analytics"
    );
    expect(skill).toBeNull();
  });

  it("is hidden from admins when the flag is off", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const skill = await GlobalSkillsRegistry.getById(
      authenticator,
      "workspace-analytics"
    );
    expect(skill).toBeNull();
  });

  it("is visible to admins with the flag on and wires the workspace_analytics server", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    await FeatureFlagFactory.basic(authenticator, "workspace_analytics");

    const skill = await GlobalSkillsRegistry.getById(
      authenticator,
      "workspace-analytics"
    );
    expect(skill).toMatchObject({
      sId: "workspace-analytics",
      name: "Workspace Analytics",
      mcpServers: [{ name: "workspace_analytics" }],
    });
  });
});
