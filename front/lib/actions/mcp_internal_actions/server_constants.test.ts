import { describe, expect, it } from "vitest";

import {
  INTERNAL_MCP_SERVERS,
  LEGACY_INTERNAL_MCP_SERVER_IDS,
} from "./server_constants";

describe("INTERNAL_MCP_SERVERS", () => {
  it("should have unique IDs for all servers", () => {
    const ids = Object.values(INTERNAL_MCP_SERVERS).map((server) => server.id);
    const uniqueIds = new Set(ids);

    expect(ids.length).toBe(uniqueIds.size);
  });

  it("should not have any legacy servers", () => {
    const legacyServers = Object.values(INTERNAL_MCP_SERVERS).filter((server) =>
      LEGACY_INTERNAL_MCP_SERVER_IDS.includes(server.id)
    );
    expect(
      legacyServers.length,
      "Legacy servers should not be present in the INTERNAL_MCP_SERVERS object."
    ).toBe(0);
  });

  it("manipulating the list of auto internal tools may requires a migration", () => {
    const autoInternalTools: { name: string; id: number }[] = [];

    for (const [key, value] of Object.entries(INTERNAL_MCP_SERVERS)) {
      if (
        value.availability === "auto" ||
        value.availability === "auto_hidden_builder"
      ) {
        autoInternalTools.push({ name: key, id: value.id });
      }
    }
    const HARD_CODED_AUTO_INTERNAL_TOOLS = [
      { name: "image_generation", id: 2 },
      { name: "file_generation", id: 3 },
      { name: "web_search_&_browse", id: 5 },
      { name: "agent_router", id: 8 },
      { name: "include_data", id: 9 },
      { name: "run_dust_app", id: 10 },
      { name: "extract_data", id: 12 },
      { name: "missing_action_catcher", id: 13 },
      { name: "conversation_files", id: 17 },
      { name: "agent_memory", id: 21 },
      { name: "interactive_content", id: 23 },
      { name: "slideshow", id: 28 },
      { name: "deep_dive", id: 29 },
      { name: "search", id: 1006 },
      { name: "run_agent", id: 1008 },
      { name: "common_utilities", id: 1017 },
      { name: "reasoning", id: 1007 },
      { name: "query_tables_v2", id: 1009 },
      { name: "data_sources_file_system", id: 1010 },
      { name: "agent_management", id: 1011 },
      { name: "data_warehouses", id: 1012 },
      { name: "toolsets", id: 1013 },
    ];
    expect(
      autoInternalTools,
      "Internal tools with availability auto or auto_hidden_builder are not up to date.\n" +
        "If you are adding or removing a tool, you only need to update the hard coded list.\n" +
        "However, if you are changing the availability from auto(_xxx) to manual, " +
        "you need to run a migration on existing agents that were configured with that " +
        "tool to update their requestedGroupIds (see getAgentConfigurationGroupIdsFromActions())."
    ).toEqual(HARD_CODED_AUTO_INTERNAL_TOOLS);
  });
});
