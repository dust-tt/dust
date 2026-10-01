import { internalFetch } from "@app/lib/api/internal_fetch";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TABLE = {
  name: "orders",
  table_id: "table-1",
  description: "Orders",
  schema: null,
  timestamp: 1,
  tags: [],
  parents: ["table-1"],
  mime_type: "application/vnd.dust.table",
  title: "Orders",
};

const snowflakeKeyPair = {
  username: "loader",
  account: "ab12345",
  role: "READER",
  warehouse: "WH",
  auth_type: "keypair",
  private_key: "private-key",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function postTable(
  workspace: { sId: string },
  key: { secret: string },
  spaceId: string,
  dsId: string,
  body: unknown
) {
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/spaces/${spaceId}/data_sources/${dsId}/tables`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${key.secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
}

describe("POST /api/v1/w/:wId/spaces/:spaceId/data_sources/:dsId/tables", () => {
  beforeEach(() => {
    vi.mocked(internalFetch).mockReset();
  });

  it("rejects remote database fields from a non-system caller", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
      method: "POST",
    });
    const space = await SpaceFactory.global(workspace);
    const dataSourceView = await DataSourceViewFactory.folder(workspace, space);

    const response = await postTable(
      workspace,
      key,
      space.sId,
      dataSourceView.dataSource.sId,
      {
        name: "orders",
        description: "Orders",
        title: "Orders",
        remote_database_table_id: "DB.PUBLIC.ORDERS",
        remote_database_secret_id: "cred_leaked-secret",
      }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        type: "invalid_request_error",
      },
    });
    expect(internalFetch).not.toHaveBeenCalled();
  });

  it("upserts a table for a non-system caller when remote database fields are omitted", async () => {
    vi.mocked(internalFetch).mockImplementation(async (url) => {
      expect(String(url)).toContain("/tables");
      expect(String(url)).not.toContain("/credentials/");
      return json({ response: { table: TABLE } });
    });

    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
      method: "POST",
    });
    const space = await SpaceFactory.global(workspace);
    const dataSourceView = await DataSourceViewFactory.folder(workspace, space);

    const response = await postTable(
      workspace,
      key,
      space.sId,
      dataSourceView.dataSource.sId,
      {
        name: "orders",
        description: "Orders",
        title: "Orders",
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      table: { table_id: "table-1", name: "orders" },
    });
  });

  it("rejects a system caller attaching a credential from another workspace", async () => {
    vi.mocked(internalFetch).mockImplementation(async (url) => {
      const target = String(url);
      expect(target).toContain("/credentials/");
      expect(target).not.toContain("/tables");
      return json({
        response: {
          credential: {
            credential_id: "cred_other",
            created: 1,
            provider: "snowflake",
            metadata: { workspace_id: "another-workspace", user_id: "user" },
            content: snowflakeKeyPair,
          },
        },
      });
    });

    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
      method: "POST",
    });
    const space = await SpaceFactory.global(workspace);
    const dataSourceView = await DataSourceViewFactory.folder(workspace, space);

    const response = await postTable(
      workspace,
      key,
      space.sId,
      dataSourceView.dataSource.sId,
      {
        name: "orders",
        description: "Orders",
        title: "Orders",
        mime_type: "application/vnd.dust.table",
        remote_database_table_id: "DB.PUBLIC.ORDERS",
        remote_database_secret_id: "cred_other",
      }
    );

    expect(response.status).toBe(400);
    const calls = vi
      .mocked(internalFetch)
      .mock.calls.map((call) => String(call[0]));
    expect(calls.some((url) => url.includes("/tables"))).toBe(false);
  });

  it("accepts a system caller attaching a snowflake credential for this workspace", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
      method: "POST",
    });
    const space = await SpaceFactory.global(workspace);

    vi.mocked(internalFetch).mockImplementation(async (url, init) => {
      const target = String(url);
      if (target.includes("/credentials/")) {
        return json({
          response: {
            credential: {
              credential_id: "cred_own",
              created: 1,
              provider: "snowflake",
              metadata: { workspace_id: workspace.sId, user_id: "user" },
              content: snowflakeKeyPair,
            },
          },
        });
      }

      const body = JSON.parse(String((init as RequestInit).body));
      expect(body.remote_database_secret_id).toBe("cred_own");
      expect(body.remote_database_table_id).toBe("DB.PUBLIC.ORDERS");
      return json({ response: { table: TABLE } });
    });
    const dataSourceView = await DataSourceViewFactory.folder(workspace, space);

    const response = await postTable(
      workspace,
      key,
      space.sId,
      dataSourceView.dataSource.sId,
      {
        name: "orders",
        description: "Orders",
        title: "Orders",
        mime_type: "application/vnd.dust.table",
        remote_database_table_id: "DB.PUBLIC.ORDERS",
        remote_database_secret_id: "cred_own",
      }
    );

    expect(response.status).toBe(200);
  });
});
