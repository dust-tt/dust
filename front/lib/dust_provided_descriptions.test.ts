import { internalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import {
  AVAILABLE_INTERNAL_MCP_SERVER_NAMES,
  INTERNAL_MCP_SERVERS,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { getGlobalAgentMetadata } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import {
  getAgentDisplayDescription,
  getMCPServerDisplayDescription,
  getMcpServerViewDisplayDescription,
  getSkillDisplayDescription,
} from "@app/lib/dust_provided_descriptions";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import { GLOBAL_SKILLS_ARRAY } from "@app/lib/resources/skill/code_defined/global";
import { SYSTEM_SKILLS_ARRAY } from "@app/lib/resources/skill/code_defined/system";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { MessageDescriptor } from "@lingui/core";
import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const t = (descriptor: MessageDescriptor) => i18n._(descriptor);

describe("english-matches-source", () => {
  it("renders the source description of every global agent in en-US", () => {
    for (const sId of Object.values(GLOBAL_AGENTS_SID)) {
      const { description } = getGlobalAgentMetadata(sId);
      expect(getAgentDisplayDescription(t, { sId, description })).toBe(
        description
      );
    }
  });

  it("renders the source description of every code-defined skill in en-US", () => {
    for (const { sId, userFacingDescription } of [
      ...GLOBAL_SKILLS_ARRAY,
      ...SYSTEM_SKILLS_ARRAY,
    ]) {
      expect(
        getSkillDisplayDescription(t, { sId, userFacingDescription })
      ).toBe(userFacingDescription);
    }
  });

  it("renders the source description of every internal MCP server in en-US", () => {
    for (const name of AVAILABLE_INTERNAL_MCP_SERVER_NAMES) {
      const { description } = INTERNAL_MCP_SERVERS[name].metadata.serverInfo;
      const sId = internalMCPServerNameToSId({
        name,
        workspaceId: 1,
        prefix: 1,
      });
      expect(getMCPServerDisplayDescription(t, { sId, description })).toBe(
        description
      );
    }
  });
});

describe("translation", () => {
  it("translates Dust-provided descriptions and keeps the others", async () => {
    const messages = await loadCatalog("fr-FR");
    act(() => i18n.loadAndActivate({ locale: "fr-FR", messages }));

    const dust = getGlobalAgentMetadata(GLOBAL_AGENTS_SID.DUST);
    expect(getAgentDisplayDescription(t, dust)).not.toBe(dust.description);
    expect(
      getAgentDisplayDescription(t, {
        sId: "custom",
        description: dust.description,
      })
    ).toBe(dust.description);

    const [skill] = GLOBAL_SKILLS_ARRAY;
    expect(getSkillDisplayDescription(t, skill)).not.toBe(
      skill.userFacingDescription
    );
    expect(
      getSkillDisplayDescription(t, {
        sId: "custom",
        userFacingDescription: skill.userFacingDescription,
      })
    ).toBe(skill.userFacingDescription);

    const server = {
      sId: internalMCPServerNameToSId({
        name: "search",
        workspaceId: 1,
        prefix: 1,
      }),
      description: INTERNAL_MCP_SERVERS.search.metadata.serverInfo.description,
    };
    expect(getMCPServerDisplayDescription(t, server)).not.toBe(
      server.description
    );
    expect(
      getMcpServerViewDisplayDescription(t, {
        description: "Custom description",
        server,
      })
    ).toBe("Custom description");
  });
});
