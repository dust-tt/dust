import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { Authenticator } from "@app/lib/auth";
import { Ok } from "@app/types/shared/result";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSearchNodes,
  mockGetAgentDataSourceConfigurations,
  mockMakeCoreSearchNodesFilters,
  mockRenderSearchResults,
} = vi.hoisted(() => ({
  mockSearchNodes: vi.fn(),
  mockGetAgentDataSourceConfigurations: vi.fn(),
  mockMakeCoreSearchNodesFilters: vi.fn(),
  mockRenderSearchResults: vi.fn(),
}));

vi.mock("@app/types/core/core_api", () => ({
  CoreAPI: class MockCoreAPI {
    searchNodes = mockSearchNodes;
  },
}));

vi.mock("@app/lib/actions/mcp_internal_actions/tools/utils", () => ({
  getAgentDataSourceConfigurations: mockGetAgentDataSourceConfigurations,
  makeCoreSearchNodesFilters: mockMakeCoreSearchNodesFilters,
}));

vi.mock("@app/lib/actions/mcp_internal_actions/rendering", () => ({
  renderSearchResults: mockRenderSearchResults,
}));

import { find } from "./find";

const FAKE_AGENT_DATA_SOURCE_CONFIGURATIONS = [
  {
    filter: {
      tags: null,
    },
    dataSource: {
      dustAPIDataSourceId: "managed-slack",
      connectorProvider: "slack",
    },
  },
] as const;

const FAKE_VIEW_FILTER = [
  {
    data_source_id: "managed-slack",
    view_filter: [],
  },
] as const;

const FAKE_SEARCH_NODES_RESPONSE = {
  nodes: [],
  next_page_cursor: null,
  hit_count: 0,
  hit_count_is_accurate: true,
  warning_code: null,
};

const FAKE_RENDERED_RESOURCE = {
  mimeType: "application/vnd.dust.tool-output.data-source-node-list",
  text: "Content successfully retrieved.",
  uri: "",
  data: [],
  nextPageCursor: null,
  resultCount: 0,
};

const FAKE_DATA_SOURCES: DataSourcesToolConfigurationType = [
  {
    uri: "data_source_configuration://dust/w/ws/data_source_configurations/dsv",
    mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
  },
];

const FAKE_AUTHENTICATOR = new Authenticator({
  role: "none",
  groupModelIds: [],
  authMethod: "internal",
});

describe("data_sources_file_system.find", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetAgentDataSourceConfigurations.mockResolvedValue(
      new Ok(FAKE_AGENT_DATA_SOURCE_CONFIGURATIONS)
    );
    mockMakeCoreSearchNodesFilters.mockReturnValue(FAKE_VIEW_FILTER);
    mockSearchNodes.mockResolvedValue(new Ok(FAKE_SEARCH_NODES_RESPONSE));
    mockRenderSearchResults.mockReturnValue(FAKE_RENDERED_RESOURCE);
  });

  it("uses a small default limit when the model omits one", async () => {
    const result = await find(
      {
        query: "product ideas feedback",
        dataSources: FAKE_DATA_SOURCES,
      },
      { auth: FAKE_AUTHENTICATOR }
    );

    expect(result.isOk()).toBe(true);
    expect(mockSearchNodes).toHaveBeenCalledWith({
      query: "product ideas feedback",
      filter: {
        data_source_views: FAKE_VIEW_FILTER,
        mime_types: undefined,
      },
      options: {
        cursor: undefined,
        limit: 20,
      },
    });
  });

  it("preserves an explicit limit and cursor", async () => {
    const result = await find(
      {
        query: "product ideas feedback",
        dataSources: FAKE_DATA_SOURCES,
        limit: 7,
        nextPageCursor: "next-page",
      },
      { auth: FAKE_AUTHENTICATOR }
    );

    expect(result.isOk()).toBe(true);
    expect(mockSearchNodes).toHaveBeenCalledWith({
      query: "product ideas feedback",
      filter: {
        data_source_views: FAKE_VIEW_FILTER,
        mime_types: undefined,
      },
      options: {
        cursor: "next-page",
        limit: 7,
      },
    });
  });
});
