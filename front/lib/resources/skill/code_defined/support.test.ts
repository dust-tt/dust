import { WEB_SEARCH_BROWSE_SERVER_NAME } from "@app/lib/api/actions/servers/web_search_browse/metadata";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("support code-defined skill", () => {
  it("is a discoverable global skill grounded on public Dust support surfaces", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const support = await GlobalSkillsRegistry.getById(
      authenticator,
      "support"
    );

    expect(support).toMatchObject({
      sId: "support",
      name: "Dust Support",
      icon: "ActionHandHeartIcon",
      mcpServers: [
        { name: WEB_SEARCH_BROWSE_SERVER_NAME },
        {
          name: "data_sources_file_system",
          serverNameOverride: "company_data",
        },
        { name: "data_warehouses" },
      ],
      inheritAgentConfigurationDataSources: true,
    });
    expect(support?.instructions).toContain("https://docs.dust.tt/llms.txt");
    expect(support?.instructions).toContain(
      "https://github.com/dust-tt/dust/issues"
    );
    expect(support?.instructions).toContain("https://community.dust.tt");
    expect(support?.instructions).toContain(
      "https://dust-community.tightknit.community/join"
    );
    expect(support?.instructions).toContain("IT-maintained Dust runbooks");
    expect(support?.instructions).toContain("Mandatory first step");
    expect(support?.instructions).toContain(
      "Do not use workspace knowledge tools as the first or only evidence source"
    );
    expect(support?.instructions).toContain(
      "Do not search arbitrary company data for general Dust support questions"
    );
    expect(support?.instructions).toContain("Hard non-commit rules");
    expect(support?.instructions).toContain(
      "NEVER invent Dust features, capabilities, limits, URLs, policies, support channels, or timelines"
    );
    expect(support?.instructions).toContain(
      "NEVER make promises about future features"
    );
    expect(support?.instructions).toContain("Escalation path");
    expect(support?.instructions).toContain(
      "For unresolved public how-to questions"
    );
    expect(support?.agentFacingDescription).toContain(
      "workspace knowledge only for user-provided or workspace-specific Dust context"
    );
    expect(support?.instructions).toContain("Do not file GitHub issues");

    const discoverableSkills =
      await SkillResource.listDiscoverable(authenticator);

    expect(discoverableSkills.map((skill) => skill.sId)).toContain("support");
  });
});
