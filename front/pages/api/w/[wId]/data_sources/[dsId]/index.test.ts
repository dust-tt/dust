import { describe, expect, it } from "vitest";

import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

import handler from "./index";

describe("POST /api/w/[wId]/data_sources/[dsId]", () => {
  it("returns 404 when data source not found", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
    });

    req.query.dsId = "non-existent";
    req.body = {
      assistantDefaultSelected: true,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(JSON.parse(res._getData())).toEqual({
      error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  });

  it("returns 400 when invalid path parameters", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
    });

    req.query.dsId = ["invalid", "array"];
    req.body = {
      assistantDefaultSelected: true,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  });

  it("returns 403 if not authorized to administrate the data source", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
    });
    const space = await SpaceFactory.regular(workspace);
    const dataSourceView = await DataSourceViewFactory.folder(workspace, space);

    req.query.dsId = dataSourceView.dataSource.sId;
    req.body = {
      assistantDefaultSelected: true,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toEqual({
      error: {
        type: "data_source_auth_error",
        message:
          "You do not have permission to access this data source's settings.",
      },
    });
  });

  it("returns 400 when request body is invalid", async () => {
    const { req, res, workspace, globalGroup } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });
    const space = await SpaceFactory.global(workspace);
    await GroupSpaceFactory.associate(space, globalGroup);

    const dataSourceView = await DataSourceViewFactory.folder(workspace, space);

    req.query.dsId = dataSourceView.dataSource.sId;
    req.body = {
      assistantDefaultSelected: "invalid",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "Only the assistantDefaultSelected setting can be updated for managed data sources, which must be boolean.",
      },
    });
  });

  it("successfully updates assistantDefaultSelected to true (admin only)", async () => {
    const { req, res, workspace, globalGroup } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });
    const space = await SpaceFactory.global(workspace);
    await GroupSpaceFactory.associate(space, globalGroup);

    const dataSourceView = await DataSourceViewFactory.folder(workspace, space);

    req.query.dsId = dataSourceView.dataSource.sId;
    req.body = {
      assistantDefaultSelected: true,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const response = JSON.parse(res._getData());
    expect(response.dataSource).toBeDefined();
    expect(response.dataSource.sId).toBe(dataSourceView.dataSource.sId);
  });

  it("successfully updates assistantDefaultSelected to false", async () => {
    const { req, res, workspace, globalGroup } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });
    const space = await SpaceFactory.global(workspace);
    await GroupSpaceFactory.associate(space, globalGroup);

    const dataSourceView = await DataSourceViewFactory.folder(workspace, space);

    req.query.dsId = dataSourceView.dataSource.sId;
    req.body = {
      assistantDefaultSelected: false,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const response = JSON.parse(res._getData());
    expect(response.dataSource).toBeDefined();
    expect(response.dataSource.sId).toBe(dataSourceView.dataSource.sId);
  });
});
