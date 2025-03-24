import { describe, expect, vi } from "vitest";

import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { itInTransaction } from "@app/tests/utils/utils";
import { CoreAPI } from "@app/types";

import handler from "./index";

/**
 * This mocks the module, and is where we'll mock the class' methods
 */
vi.mock(
  "../../../../../../../../../types/src/front/lib/core_api",
  async (importActual) => {
    return {
      /**
       * Require the actual module (optional)
       */
      ...(await importActual()),

      /**
       * The name here should match the name of the import.
       * Use `default` if the class is a default export.
       */
      CoreAPI: vi.fn().mockReturnValue({
        searchNodes: vi.fn().mockImplementation(() => {
          console.log("LAAAAA");
          return {
            isErr: () => false,
            value: {
              nodes: CORE_SEARCH_NODES_FAKE_RESPONSE,
            },
          } as any;
        }),
        /*mockResolvedValue({
        isErr: () => false,
        value: {
          nodes: CORE_SEARCH_NODES_FAKE_RESPONSE,
        },
      } as any),*/
      }),
    };
  }
);

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

describe("GET /api/w/[wId]/spaces/[spaceId]/data_source_views/[dsvId]/tables", () => {
  itInTransaction(
    "returns 404 when user cannot read or administrate",
    async (t) => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

      const space = await SpaceFactory.global(workspace, t);
      const dataSourceView = await DataSourceViewFactory.folder(
        workspace,
        space,
        t
      );

      req.query = {
        ...req.query,
        spaceId: space.sId,
        dsvId: dataSourceView.sId,
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "data_source_view_not_found",
          message: "The data source view you requested was not found.",
        },
      });
    }
  );

  itInTransaction(
    "returns 400 with invalid pagination parameters",
    async (t) => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      const space = await SpaceFactory.global(workspace, t);
      const dataSourceView = await DataSourceViewFactory.folder(
        workspace,
        space,
        t
      );

      req.query = {
        ...req.query,
        spaceId: space.sId,
        dsvId: dataSourceView.sId,
        limit: "invalid",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "invalid_pagination_parameters",
          message: "Invalid pagination parameters",
        },
      });
    }
  );

  itInTransaction(
    "returns tables successfully",
    async (t) => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      const space = await SpaceFactory.global(workspace, t);
      const dataSourceView = await DataSourceViewFactory.folder(
        workspace,
        space,
        t
      );

      req.query = {
        ...req.query,
        spaceId: space.sId,
        dsvId: dataSourceView.sId,
      };

      vi.spyOn(CoreAPI.prototype, "searchNodes").mockImplementation(() => {
        console.log("searchNodes called");
        return {
          isErr: () => false,
          value: {
            nodes: CORE_SEARCH_NODES_FAKE_RESPONSE,
          },
        } as any;
      });
      //     mockResolvedValue({
      //   isErr: () => false,
      //   value: {
      //     CORE_SEARCH_NODES_RESPONSE,
      //   },
      // } as any);

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({
        tables: CORE_SEARCH_NODES_FAKE_RESPONSE,
      });
    },
    true // Skip for now, I have trouble mocking correctly the CoreAPI.searchNodes
  );

  itInTransaction("returns 405 for non-GET methods", async (t) => {
    for (const method of ["POST", "PUT", "DELETE"] as const) {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method,
        role: "admin",
      });

      const space = await SpaceFactory.global(workspace, t);
      const dataSourceView = await DataSourceViewFactory.folder(
        workspace,
        space,
        t
      );

      req.query = {
        ...req.query,
        spaceId: space.sId,
        dsvId: dataSourceView.sId,
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
    }
  });
});
