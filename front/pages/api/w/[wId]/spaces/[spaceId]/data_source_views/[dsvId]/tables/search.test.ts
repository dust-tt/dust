import { describe, expect, it, vi } from "vitest";

import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";

import handler from "./search";

const CORE_SEARCH_NODES_FAKE_RESPONSE = [
  {
    data_source_id: "managed-notion",
    data_source_internal_id: "f7d8e9c6b5a4321098765432109876543210abcd",
    node_id: "notion-table-123abc456def789",
    node_type: "table",
    text_size: null,
    timestamp: 1734536444373,
    title: "Project Tasks",
    mime_type: "application/vnd.dust.notion.database",
    provider_visibility: null,
    parent_id: "notion-page-abc123def456",
    parents: [
      "notion-table-123abc456def789",
      "notion-page-abc123def456",
      "notion-workspace-root789",
    ],
    source_url: null,
    tags: [],
    children_count: 1,
    parent_title: "Q1 Planning",
  },
  {
    data_source_id: "managed-notion",
    data_source_internal_id: "f7d8e9c6b5a4321098765432109876543210abcd",
    node_id: "notion-table-987xyz654abc",
    node_type: "table",
    text_size: null,
    timestamp: 1734537881237,
    title: "Team Members",
    mime_type: "application/vnd.dust.notion.database",
    provider_visibility: null,
    parent_id: "notion-page-xyz987abc",
    parents: [
      "notion-table-987xyz654abc",
      "notion-page-xyz987abc",
      "notion-workspace-root789",
    ],
    source_url: null,
    tags: [],
    children_count: 1,
    parent_title: "Team Directory",
  },
  {
    data_source_id: "managed-notion",
    data_source_internal_id: "f7d8e9c6b5a4321098765432109876543210abcd",
    node_id: "notion-table-456pqr789stu",
    node_type: "table",
    text_size: null,
    timestamp: 1734538054345,
    title: "Budget Overview",
    mime_type: "application/vnd.dust.notion.database",
    provider_visibility: null,
    parent_id: "notion-page-pqr789stu",
    parents: [
      "notion-table-456pqr789stu",
      "notion-page-pqr789stu",
      "notion-workspace-root789",
    ],
    source_url: null,
    tags: [],
    children_count: 1,
    parent_title: "Finance",
  },
];

vi.mock(
  "../../../../../../../../../types/src/front/lib/core_api",
  async (importActual) => {
    return {
      ...(await importActual()),

      CoreAPI: vi.fn().mockImplementation(() => ({
        searchNodes: vi.fn().mockImplementation((options) => {
          if (options.query === "tasks") {
            return {
              isErr: () => false,
              value: {
                nodes: CORE_SEARCH_NODES_FAKE_RESPONSE,
                next_page_cursor: "w",
                warning_code: null,
              },
            };
          } else if (options.query.query === "empty") {
            return {
              isErr: () => false,
              value: {
                nodes: [],
                next_page_cursor: null,
                warning_code: null,
              },
            };
          }
          return {
            isErr: () => true,
            error: new Error("Unexpected query"),
          };
        }),
      })),
    };
  }
);

describe("GET /api/w/[wId]/spaces/[spaceId]/data_source_views/[dsvId]/tables/search", () => {
  it("blocks non-GET methods", async () => {
    const { req, res, workspace, globalSpace } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace
    );

    req.query = {
      ...req.query,
      spaceId: globalSpace.sId,
      dsvId: dataSourceView.sId,
      query: "valid",
    };

    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it("requires minimum query length", async () => {
    const { req, res, workspace, globalSpace } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace
    );

    req.query = {
      ...req.query,
      spaceId: globalSpace.sId,
      dsvId: dataSourceView.sId,
      query: "a",
    };

    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it.skip("returns tables with search results", async () => {
    const { req, res, workspace, globalSpace } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace
    );

    req.query = {
      ...req.query,
      spaceId: globalSpace.sId,
      dsvId: dataSourceView.sId,
      query: "tasks",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().tables.length).toBe(3);
  });

  it.skip("handles empty results", async () => {
    const { req, res, workspace, globalSpace } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace
    );

    req.query = {
      ...req.query,
      spaceId: globalSpace.sId,
      dsvId: dataSourceView.sId,
      query: "empty",
    };

    await handler(req, res);
  });

  it.skip("propagates warnings", async () => {
    const { req, res, workspace, globalSpace } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace
    );

    req.query = {
      ...req.query,
      spaceId: globalSpace.sId,
      dsvId: dataSourceView.sId,
      query: "warning",
    };

    await handler(req, res);
  });
});
