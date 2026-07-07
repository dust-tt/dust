import { deduplicateMCPServerConfigurations } from "@app/lib/actions/mcp_actions";
import { isServerSideMCPServerConfigurationWithName } from "@app/lib/actions/types/guards";
import { getSkillServers } from "@app/lib/api/assistant/skill_actions";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("getSkillServers", () => {
  it("deduplicates shared company data tools from Discover Knowledge and Go Deep", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    await MCPServerViewResource.ensureAllAutoToolsAreCreated(authenticator);

    const agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const skills = await SkillResource.fetchByIds(authenticator, [
      "discover_knowledge",
      "go-deep",
    ]);

    const skillServers = await getSkillServers(authenticator, {
      agentConfiguration,
      skills,
    });

    const fileSystemServers = skillServers.filter((server) =>
      isServerSideMCPServerConfigurationWithName(
        server,
        "data_sources_file_system"
      )
    );
    expect(fileSystemServers).toHaveLength(2);
    expect(fileSystemServers.map((server) => server.name)).toEqual([
      "company_data",
      "company_data",
    ]);

    const deduplicatedServers = deduplicateMCPServerConfigurations({
      agentActions: [],
      clientSideActions: [],
      skillServers,
      jitServers: [],
    });

    const deduplicatedFileSystemServers = deduplicatedServers.filter((server) =>
      isServerSideMCPServerConfigurationWithName(
        server,
        "data_sources_file_system"
      )
    );
    expect(deduplicatedFileSystemServers).toHaveLength(1);
    expect(deduplicatedFileSystemServers[0].name).toBe("company_data");
  });
});
