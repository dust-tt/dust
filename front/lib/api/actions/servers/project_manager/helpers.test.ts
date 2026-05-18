import { getProjectConversationFolderInternalId } from "@app/lib/api/projects/context";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildProjectRetrieveDataSources } from "./helpers";

const { mockFetchProjectDataSourceView, mockListProjectContextAttachments } =
  vi.hoisted(() => ({
    mockFetchProjectDataSourceView: vi.fn(),
    mockListProjectContextAttachments: vi.fn(),
  }));

vi.mock("@app/lib/api/projects/data_sources", () => ({
  fetchProjectDataSourceView: mockFetchProjectDataSourceView,
}));

vi.mock("@app/lib/api/projects/context", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/projects/context")>();
  return {
    ...actual,
    listProjectContextAttachments: mockListProjectContextAttachments,
  };
});

function mockProjectDataSourceViewResource(
  sId: string,
  connectorId?: string | null
) {
  return {
    sId,
    toJSON: () => ({
      dataSource:
        connectorId != null && connectorId !== "" ? { connectorId } : {},
    }),
  };
}

describe("buildProjectRetrieveDataSources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes project datasource view and unique content nodes", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const projectSpace = await SpaceFactory.project(workspace);

    mockFetchProjectDataSourceView.mockResolvedValue({
      isOk: () => true,
      value: mockProjectDataSourceViewResource("dsv_project"),
    });
    mockListProjectContextAttachments.mockResolvedValue([
      // Content node attachment.
      {
        contentFragmentId: "cf_1",
        nodeDataSourceViewId: "dsv_node_1",
        nodeId: "node_1",
      },
      // Duplicate (same view+node) should be deduplicated.
      {
        contentFragmentId: "cf_2",
        nodeDataSourceViewId: "dsv_node_1",
        nodeId: "node_1",
      },
      // Same node id on different view should be kept.
      {
        contentFragmentId: "cf_3",
        nodeDataSourceViewId: "dsv_node_2",
        nodeId: "node_1",
      },
      // File attachment should be ignored.
      {
        fileId: "file_1",
      },
    ]);

    const dataSources = await buildProjectRetrieveDataSources(auth, {
      space: projectSpace,
      onlyGroupConversationsAndConnectedData: false,
    });

    expect(dataSources).toEqual([
      {
        uri: `data_source_configuration://dust/w/${workspace.sId}/data_source_views/dsv_project/filter/%7B%22parents%22%3Anull%2C%22tags%22%3Anull%7D`,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
      },
      {
        uri: `data_source_configuration://dust/w/${workspace.sId}/data_source_views/dsv_node_1/filter/%7B%22parents%22%3A%7B%22in%22%3A%5B%22node_1%22%5D%2C%22not%22%3A%5B%5D%7D%2C%22tags%22%3Anull%7D`,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
      },
      {
        uri: `data_source_configuration://dust/w/${workspace.sId}/data_source_views/dsv_node_2/filter/%7B%22parents%22%3A%7B%22in%22%3A%5B%22node_1%22%5D%2C%22not%22%3A%5B%5D%7D%2C%22tags%22%3Anull%7D`,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
      },
    ]);
  });

  it("still returns content-node data sources when project datasource view is missing", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const projectSpace = await SpaceFactory.project(workspace);

    mockFetchProjectDataSourceView.mockResolvedValue({
      isOk: () => false,
    });
    mockListProjectContextAttachments.mockResolvedValue([
      {
        contentFragmentId: "cf_1",
        nodeDataSourceViewId: "dsv_node_1",
        nodeId: "node_1",
      },
    ]);

    const dataSources = await buildProjectRetrieveDataSources(auth, {
      space: projectSpace,
      onlyGroupConversationsAndConnectedData: false,
    });

    expect(dataSources).toEqual([
      {
        uri: `data_source_configuration://dust/w/${workspace.sId}/data_source_views/dsv_node_1/filter/%7B%22parents%22%3A%7B%22in%22%3A%5B%22node_1%22%5D%2C%22not%22%3A%5B%5D%7D%2C%22tags%22%3Anull%7D`,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
      },
    ]);
  });

  it("scopes the project data source view to group conversations when onlyGroupConversationsAndConnectedData is true and a connector id is set", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const projectSpace = await SpaceFactory.project(workspace);
    const connectorId = "connector_test";

    mockFetchProjectDataSourceView.mockResolvedValue({
      isOk: () => true,
      value: mockProjectDataSourceViewResource("dsv_project", connectorId),
    });
    mockListProjectContextAttachments.mockResolvedValue([]);

    const folderInternalId = getProjectConversationFolderInternalId(
      connectorId,
      projectSpace.sId
    );
    const filter = {
      parents: { in: [folderInternalId], not: [] },
      tags: { in: ["group"], not: [], mode: "custom" as const },
    };

    const dataSources = await buildProjectRetrieveDataSources(auth, {
      space: projectSpace,
      onlyGroupConversationsAndConnectedData: true,
    });

    expect(dataSources).toEqual([
      {
        uri: `data_source_configuration://dust/w/${workspace.sId}/data_source_views/dsv_project/filter/${encodeURIComponent(JSON.stringify(filter))}`,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
      },
    ]);
  });

  it("leaves the project data source view unfiltered when onlyGroupConversationsAndConnectedData is true but connector id is absent", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const projectSpace = await SpaceFactory.project(workspace);

    mockFetchProjectDataSourceView.mockResolvedValue({
      isOk: () => true,
      value: mockProjectDataSourceViewResource("dsv_project"),
    });
    mockListProjectContextAttachments.mockResolvedValue([]);

    const dataSources = await buildProjectRetrieveDataSources(auth, {
      space: projectSpace,
      onlyGroupConversationsAndConnectedData: true,
    });

    expect(dataSources).toEqual([
      {
        uri: `data_source_configuration://dust/w/${workspace.sId}/data_source_views/dsv_project/filter/%7B%22parents%22%3Anull%2C%22tags%22%3Anull%7D`,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
      },
    ]);
  });

  it("still adds content-node data sources when the project view is scoped with onlyGroupConversationsAndConnectedData", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const projectSpace = await SpaceFactory.project(workspace);
    const connectorId = "connector_test";

    mockFetchProjectDataSourceView.mockResolvedValue({
      isOk: () => true,
      value: mockProjectDataSourceViewResource("dsv_project", connectorId),
    });
    mockListProjectContextAttachments.mockResolvedValue([
      {
        contentFragmentId: "cf_1",
        nodeDataSourceViewId: "dsv_node_1",
        nodeId: "node_1",
      },
    ]);

    const folderInternalId = getProjectConversationFolderInternalId(
      connectorId,
      projectSpace.sId
    );
    const projectFilter = {
      parents: { in: [folderInternalId], not: [] },
      tags: { in: ["group"], not: [], mode: "custom" as const },
    };

    const dataSources = await buildProjectRetrieveDataSources(auth, {
      space: projectSpace,
      onlyGroupConversationsAndConnectedData: true,
    });

    expect(dataSources).toEqual([
      {
        uri: `data_source_configuration://dust/w/${workspace.sId}/data_source_views/dsv_project/filter/${encodeURIComponent(JSON.stringify(projectFilter))}`,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
      },
      {
        uri: `data_source_configuration://dust/w/${workspace.sId}/data_source_views/dsv_node_1/filter/%7B%22parents%22%3A%7B%22in%22%3A%5B%22node_1%22%5D%2C%22not%22%3A%5B%5D%7D%2C%22tags%22%3Anull%7D`,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
      },
    ]);
  });
});
