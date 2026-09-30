import { BUILDING_AGENTS_AND_SKILLS_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import { WORKSPACE_MANAGEMENT_SERVER_NAME } from "@app/lib/api/actions/servers/workspace_management/metadata";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("conversational-building code-defined skill", () => {
  it("wires the building_agents_and_skills and workspace_management servers", async () => {
    const { authenticator } = await createResourceTest({ role: "user" });

    const skill = await GlobalSkillsRegistry.getById(
      authenticator,
      "conversational-building"
    );
    expect(skill).toMatchObject({
      sId: "conversational-building",
      mcpServers: [
        { name: BUILDING_AGENTS_AND_SKILLS_SERVER_NAME },
        { name: WORKSPACE_MANAGEMENT_SERVER_NAME },
      ],
    });
  });
});
