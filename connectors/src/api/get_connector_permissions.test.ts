import type { Server } from "node:http";

import { ConnectorManagerError } from "@connectors/connectors/interface";
import { Err } from "@dust-tt/client";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getConnectorPermissionsAPIHandler } from "./get_connector_permissions";

const mocks = vi.hoisted(() => ({
  fetchById: vi.fn(),
  retrievePermissions: vi.fn(),
}));

vi.mock("@connectors/connectors", () => ({
  getConnectorManager: () => ({
    retrievePermissions: mocks.retrievePermissions,
  }),
}));

vi.mock("@connectors/resources/connector_resource", () => ({
  ConnectorResource: {
    fetchById: mocks.fetchById,
  },
}));

describe("GET /connectors/:connector_id/permissions", () => {
  let server: Server;
  let baseUrl = "";

  beforeAll(async () => {
    const app = express();
    app.get(
      "/connectors/:connector_id/permissions",
      getConnectorPermissionsAPIHandler
    );
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected the test server to listen on a TCP port");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  });

  it("returns 401 connector_authorization_error on EXTERNAL_OAUTH_TOKEN_ERROR", async () => {
    mocks.fetchById.mockResolvedValue({ id: 1, type: "salesforce" });
    mocks.retrievePermissions.mockResolvedValue(
      new Err(
        new ConnectorManagerError(
          "EXTERNAL_OAUTH_TOKEN_ERROR",
          "Authorization error, please re-authorize."
        )
      )
    );

    const response = await fetch(
      `${baseUrl}/connectors/1/permissions?viewType=document&filterPermission=read`
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        type: "connector_authorization_error",
        message: "Authorization error, please re-authorize.",
      },
    });
  });
});
