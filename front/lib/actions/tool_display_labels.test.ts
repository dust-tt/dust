import {
  getStaticToolDisplayLabelsFromFunctionCallName,
  getToolAggregateDisplayLabel,
  getToolDisplayLabels,
  getToolNameFromFunctionCallName,
} from "@app/lib/actions/tool_display_labels";
import { describe, expect, it } from "vitest";

describe("getToolNameFromFunctionCallName", () => {
  it("extracts the unprefixed tool name", () => {
    expect(
      getToolNameFromFunctionCallName("sales__github__get_pull_request")
    ).toBe("get_pull_request");
  });

  it("falls back to the raw function call name when it is not prefixed", () => {
    expect(getToolNameFromFunctionCallName("search_company")).toBe(
      "search_company"
    );
  });
});

describe("getToolDisplayLabels", () => {
  it("resolves labels for internal tools", () => {
    expect(
      getToolDisplayLabels({
        internalMCPServerName: "common_utilities",
        toolName: "wait",
        inputs: {},
      })
    ).toEqual({
      running: "Waiting",
      done: "Wait",
    });
  });

  it("resolves labels for default remote tools", () => {
    expect(
      getToolDisplayLabels({
        mcpServerName: "Linear",
        toolName: "list_issues",
        inputs: {},
      })
    ).toEqual({
      running: "Listing issues on Linear",
      done: "List issues on Linear",
    });
  });

  it("infers data source file reads from GitHub issue node IDs", () => {
    expect(
      getToolDisplayLabels({
        internalMCPServerName: "data_sources_file_system",
        toolName: "cat",
        inputs: {
          nodeId: "github-issue-693580871-9196",
        },
      })
    ).toEqual({
      running: "Reading GitHub issue #9196",
      done: "Read GitHub issue #9196",
    });
  });

  it("keeps pagination details when the data source file target is inferred", () => {
    expect(
      getToolDisplayLabels({
        internalMCPServerName: "data_sources_file_system",
        toolName: "cat",
        inputs: {
          nodeId: "github-issue-693580871-9196",
          limit: 100,
        },
      })
    ).toEqual({
      running: "Reading GitHub issue #9196 (first ~100 characters)",
      done: "Read GitHub issue #9196 (first ~100 characters)",
    });
  });

  it("uses inferred data source file targets for grep labels", () => {
    expect(
      getToolDisplayLabels({
        internalMCPServerName: "data_sources_file_system",
        toolName: "cat",
        inputs: {
          nodeId: "zendesk-ticket-12-34-567",
          grep: "timeout",
        },
      })
    ).toEqual({
      running: "Searching for “timeout” in Zendesk ticket #567",
      done: "Search for “timeout” in Zendesk ticket #567",
    });

    expect(
      getToolDisplayLabels({
        internalMCPServerName: "data_sources_file_system",
        toolName: "cat",
        inputs: {
          nodeId: "zendesk-article-12-34-987654321",
        },
      })
    ).toEqual({
      running: "Reading Zendesk article #987654321",
      done: "Read Zendesk article #987654321",
    });
  });

  it.each([
    ["gdrive-abc123", "Google Drive file"],
    ["gdrive-sharedWithMe", "Google Drive shared with me"],
    ["notion-unknown", "Notion orphaned resources"],
    ["project-context-folder", "Dust project context"],
    ["intercom-teams-12", "Intercom conversations"],
    ["intercom-team-12-team_abc", "Intercom team"],
    ["zendesk-brand-12-34", "Zendesk brand"],
    ["microsoft-anything-opaque", "Microsoft content"],
    ["gong-transcript-folder-12", "Gong transcripts"],
    ["dpd_1234567890abcdef", "Dust project folder"],
  ])("uses provider labels for data source file node ID %s", (nodeId, target) => {
    expect(
      getToolDisplayLabels({
        internalMCPServerName: "data_sources_file_system",
        toolName: "cat",
        inputs: {
          nodeId,
        },
      })
    ).toEqual({
      running: `Reading ${target}`,
      done: `Read ${target}`,
    });
  });

  it("does not show opaque IDs in data source file labels", () => {
    expect(
      getToolDisplayLabels({
        internalMCPServerName: "data_sources_file_system",
        toolName: "cat",
        inputs: {
          nodeId: "slack-channel-C05V0P20A72",
        },
      })
    ).toEqual({
      running: "Reading Slack channel",
      done: "Read Slack channel",
    });

    expect(
      getToolDisplayLabels({
        internalMCPServerName: "data_sources_file_system",
        toolName: "cat",
        inputs: {
          nodeId: "salesforce-synced-query-document-12-34-001ABC",
        },
      })
    ).toEqual({
      running: "Reading Salesforce record",
      done: "Read Salesforce record",
    });
  });

  it("keeps generic data source file labels for unrecognized node IDs", () => {
    expect(
      getToolDisplayLabels({
        internalMCPServerName: "data_sources_file_system",
        toolName: "cat",
        inputs: {
          nodeId: "unknown-node",
        },
      })
    ).toEqual({
      running: "Reading file",
      done: "Read file",
    });
  });

  it.each([
    [
      "conversation-Fx7LXcp8VP/reports/quarterly-results.csv",
      "“reports/quarterly-results.csv”",
    ],
    [
      "conversation-Fx7LXcp8VP/.tool_outputs/1786717219013_github_get_pull_request.txt",
      "“github_get_pull_request.txt” from conversation",
    ],
    [
      "pod-pod123/.tool_outputs/analyze-sales/1786717219013_query_tables.json",
      "“query_tables.json” from Pod",
    ],
  ])("labels Dust file system path %s as %s", (path, target) => {
    expect(
      getToolDisplayLabels({
        internalMCPServerName: "files",
        toolName: "cat",
        inputs: { path },
      })
    ).toEqual({
      running: `Reading ${target}`,
      done: `Read ${target}`,
    });
  });

  it("keeps non-Dust file system paths unchanged", () => {
    expect(
      getToolDisplayLabels({
        internalMCPServerName: "files",
        toolName: "cat",
        inputs: { path: "/tmp/report.csv" },
      })
    ).toEqual({
      running: "Reading “/tmp/report.csv”",
      done: "Read “/tmp/report.csv”",
    });
  });

  it("labels a HubSpot search by object type", () => {
    expect(
      getToolDisplayLabels({
        internalMCPServerName: "hubspot",
        toolName: "search_crm_objects",
        inputs: { objectType: "companies" },
      })
    ).toEqual({
      running: "Searching HubSpot companies",
      done: "Search HubSpot companies",
    });
  });

  it("labels a HubSpot id lookup as a retrieval", () => {
    expect(
      getToolDisplayLabels({
        internalMCPServerName: "hubspot",
        toolName: "search_crm_objects",
        inputs: {
          objectType: "contacts",
          filters: [
            { propertyName: "hs_object_id", operator: "EQ", value: "1" },
          ],
        },
      })
    ).toEqual({
      running: "Retrieving HubSpot contacts",
      done: "Retrieve HubSpot contacts",
    });
  });

  it("includes the free-text query in a HubSpot search label", () => {
    expect(
      getToolDisplayLabels({
        internalMCPServerName: "hubspot",
        toolName: "search_crm_objects",
        inputs: { objectType: "deals", query: "acme renewal" },
      })
    ).toEqual({
      running: "Searching HubSpot deals “acme renewal”",
      done: "Search HubSpot deals “acme renewal”",
    });
  });
});

describe("getStaticToolDisplayLabelsFromFunctionCallName", () => {
  it("resolves labels from a prefixed function call name", () => {
    expect(
      getStaticToolDisplayLabelsFromFunctionCallName(
        "interactive_content__create_interactive_content_file"
      )
    ).toEqual({
      running: "Creating new Frame",
      done: "Create new Frame",
    });
  });

  it("resolves labels when the server name has a collision prefix", () => {
    expect(
      getStaticToolDisplayLabelsFromFunctionCallName(
        "sales__github__get_pull_request"
      )
    ).toEqual({
      running: "Retrieving GitHub pull request",
      done: "Retrieve GitHub pull request",
    });
  });
});

describe("getToolAggregateDisplayLabel", () => {
  it("uses the generic label instead of one execution's inputs", () => {
    expect(
      getToolAggregateDisplayLabel({
        functionCallName: "web_search_&_browse__websearch",
        toolName: "websearch",
      })
    ).toBe("Web search");
  });

  it("humanizes the tool name when no static label exists", () => {
    expect(
      getToolAggregateDisplayLabel({
        functionCallName: "custom_server__prepare_report",
        toolName: "prepare_report",
      })
    ).toBe("Prepare Report");
  });
});
