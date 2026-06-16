import {
  INTERNAL_MCP_SERVERS,
  SKILL_AUTHORING_SERVER_NAME,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("skill authoring code-defined skill", () => {
  it("is available to every workspace without a feature flag", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });

    const skill = await GlobalSkillsRegistry.getById(
      authenticator,
      "skill-authoring"
    );
    expect(skill).toMatchObject({
      sId: "skill-authoring",
      mcpServers: [{ name: SKILL_AUTHORING_SERVER_NAME }],
    });

    expect(
      INTERNAL_MCP_SERVERS[SKILL_AUTHORING_SERVER_NAME].isRestricted
    ).toBeUndefined();
  });
});
