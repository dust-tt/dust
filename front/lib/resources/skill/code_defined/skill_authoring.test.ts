import {
  INTERNAL_MCP_SERVERS,
  SKILL_AUTHORING_SERVER_NAME,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("skill authoring code-defined skill", () => {
  it("is restricted with the same feature flag as the internal server", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });

    await expect(
      GlobalSkillsRegistry.getById(authenticator, "skill-authoring")
    ).resolves.toBeNull();

    await FeatureFlagFactory.basic(authenticator, "skill_authoring_tool");

    const skill = await GlobalSkillsRegistry.getById(
      authenticator,
      "skill-authoring"
    );
    expect(skill).toMatchObject({
      sId: "skill-authoring",
      mcpServers: [{ name: SKILL_AUTHORING_SERVER_NAME }],
    });

    const isRestricted =
      INTERNAL_MCP_SERVERS[SKILL_AUTHORING_SERVER_NAME].isRestricted;
    expect(isRestricted).toBeDefined();
    expect(
      isRestricted?.({
        featureFlags: [],
        isDeepDiveDisabled: false,
        plan: authenticator.getNonNullablePlan(),
      })
    ).toBe(true);
    expect(
      isRestricted?.({
        featureFlags: ["skill_authoring_tool"],
        isDeepDiveDisabled: false,
        plan: authenticator.getNonNullablePlan(),
      })
    ).toBe(false);
  });
});
