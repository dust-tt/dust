import { createFavorite, inferTypeFromUrl } from "@app/poke/swr/favorites";
import { describe, expect, it } from "vitest";

describe("inferTypeFromUrl", () => {
  it.each([
    ["/W123", "Workspace"],
    ["/poke/W123", "Workspace"],
    ["/W123/", "Workspace"],
    ["/W123/memberships", "Members"],
    ["/W123/assistants/agent_456", "Agent"],
    ["/W123/assistants/agent_456/instructions", "Agent"],
    // Triggers live under assistants but must not be mislabeled as Agent.
    ["/W123/assistants/agent_456/triggers/trg_789", "Trigger"],
    ["/W123/conversation/cnv_1", "Conversation"],
    ["/W123/llm-traces/run_1", "LLM Trace"],
    ["/W123/data_sources/dts_1", "Data Source"],
    ["/W123/data_sources/dts_1/search", "Data Source"],
    ["/W123/groups/grp_1", "Group"],
    ["/W123/files/file_1", "Frame"],
    ["/W123/skills/skl_1", "Skill"],
    ["/W123/suggestions/sug_1", "Skill Suggestion"],
    ["/W123/webhook-sources/whs_1", "Webhook Source"],
    ["/W123/spaces/spc_1", "Space"],
    ["/W123/spaces/spc_1/apps/app_1", "App"],
    ["/W123/spaces/spc_1/data_source_views/dsv_1", "Data Source View"],
    ["/W123/spaces/spc_1/mcp_server_views/svw_1", "MCP Server"],
    // Top-level pages are not workspaces.
    ["/plans", "Page"],
    ["/cache", "Page"],
    // Query strings / hashes are ignored.
    ["/W123/assistants/agent_456?tab=runs#top", "Agent"],
  ])("maps %s to %s", (url, expected) => {
    expect(inferTypeFromUrl(url)).toBe(expected);
  });
});

describe("createFavorite", () => {
  it("infers the type from the url by default and carries optional metadata", () => {
    const favorite = createFavorite("/W123/assistants/agent_456", "My Agent", {
      subtitle: "Acme Corp",
      sId: "agent_456",
    });
    expect(favorite).toEqual({
      url: "/W123/assistants/agent_456",
      data: {
        type: "Agent",
        name: "My Agent",
        subtitle: "Acme Corp",
        sId: "agent_456",
      },
    });
  });

  it("honours an explicit type override", () => {
    const favorite = createFavorite("/templates/tpl_1", "My Template", {
      type: "Page",
    });
    expect(favorite.data.type).toBe("Page");
    expect(favorite.data.subtitle).toBeUndefined();
    expect(favorite.data.sId).toBeUndefined();
  });
});
