import { BUILDING_AGENTS_AND_SKILLS_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("conversational-building code-defined skill", () => {
  it("is hidden without the conversational_building feature flag", async () => {
    const { authenticator } = await createResourceTest({ role: "user" });

    const skill = await GlobalSkillsRegistry.getById(
      authenticator,
      "conversational-building"
    );
    expect(skill).toBeNull();
  });

  it("is visible with the flag and wires the building_agents_and_skills server", async () => {
    const { authenticator } = await createResourceTest({ role: "user" });
    await FeatureFlagFactory.basic(authenticator, "conversational_building");

    const skill = await GlobalSkillsRegistry.getById(
      authenticator,
      "conversational-building"
    );
    expect(skill).toMatchObject({
      sId: "conversational-building",
      mcpServers: [{ name: BUILDING_AGENTS_AND_SKILLS_SERVER_NAME }],
    });
  });
});
