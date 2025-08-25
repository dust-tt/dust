import { describe, expect, it } from "vitest";

import { INTERNAL_MCP_SERVERS } from "./constants";

describe("INTERNAL_MCP_SERVERS", () => {
  it("should have unique IDs for all servers", () => {
    const ids = Object.values(INTERNAL_MCP_SERVERS).map((server) => server.id);
    const uniqueIds = new Set(ids);

    expect(ids.length).toBe(uniqueIds.size);
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
      { name: "query_tables", id: 4 },
      { name: "web_search_&_browse", id: 5 },
      { name: "think", id: 6 },
      { name: "agent_router", id: 8 },
      { name: "include_data", id: 9 },
      { name: "run_dust_app", id: 10 },
      { name: "extract_data", id: 12 },
      { name: "missing_action_catcher", id: 13 },
      { name: "conversation_files", id: 17 },
      { name: "agent_memory", id: 21 },
      { name: "interactive_content", id: 23 },
      { name: "search", id: 1006 },
      { name: "run_agent", id: 1008 },
      { name: "reasoning", id: 1007 },
      { name: "query_tables_v2", id: 1009 },
      { name: "data_sources_file_system", id: 1010 },
      { name: "agent_management", id: 1011 },
      { name: "data_warehouses", id: 1012 },
      { name: "toolsets", id: 1013 },
    ];
    expect(
      autoInternalTools,
      "Internal tools with availabilty auto or auto_hidden_builder are not up to date.\nIf you are adding or removing a tool, just update the hard coded list.\nHowever, if you are changing the availability from auto(_xxx) to manual, you need to run a migration on existing agents that were configured with that tool to update their requestedGroupIds (see getAgentConfigurationGroupIdsFromActions())."
    ).toEqual(HARD_CODED_AUTO_INTERNAL_TOOLS);
  });
});
