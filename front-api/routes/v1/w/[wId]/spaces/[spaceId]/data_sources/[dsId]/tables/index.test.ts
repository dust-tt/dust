import { internalFetch } from "@app/lib/api/internal_fetch";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

const REMOTE_DATABASE_TABLE_ID = "WAREHOUSE.SCHEMA.SECRET_TABLE";
const REMOTE_DATABASE_SECRET_ID = "cred_abc-secret";

const CORE_TABLE_FAKE_RESPONSE = {
  response: {
    table: {
      project: { project_id: 47 },
      data_source_id:
        "21ab3a9994350d8bbd3f76e4c5d233696d6793b271f19407d60d7db825a16381",
      data_source_internal_id:
        "7f93516e45f485f18f889040ed13764a418acf422c34f4f0d3e9474ccccb5386",
      created: 1738254966701,
      table_id: "fooTable-1",
      name: "footable",
      description: "desc",
      timestamp: 1738254966701,
      tags: [],
      title: "Wonderful table",
      mime_type: "text/csv",
      provider_visibility: null,
      parent_id: null,
      parents: ["fooTable-1"],
      source_url: null,
      schema: null,
      schema_stale_at: null,
      remote_database_table_id: REMOTE_DATABASE_TABLE_ID,
      remote_database_secret_id: REMOTE_DATABASE_SECRET_ID,
    },
  },
};

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
  it.each([
    { remote_database_table_id: REMOTE_DATABASE_TABLE_ID },
    { remote_database_secret_id: REMOTE_DATABASE_SECRET_ID },
  ])("rejects remote database fields from a non-system key (%o)", async (remoteFields) => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
      method: "POST",
    });
    const space = await SpaceFactory.global(workspace);
    const dataSourceView = await DataSourceViewFactory.folder(workspace, space);

    const res = await postTable(
      workspace,
      key,
      space.sId,
      dataSourceView.dataSource.sId,
      {
        name: "footable",
        description: "desc",
        title: "Wonderful table",
        ...remoteFields,
      }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.type).toBe("invalid_request_error");
    expect(internalFetch).not.toHaveBeenCalled();
  });

  it("forwards remote database fields from a system key", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
      method: "POST",
    });
    const space = await SpaceFactory.global(workspace);
    const dataSourceView = await DataSourceViewFactory.folder(workspace, space);

    vi.mocked(internalFetch).mockImplementation(async (_url, init) => {
      const req = JSON.parse(String(init?.body));
      expect(req.remote_database_table_id).toBe(REMOTE_DATABASE_TABLE_ID);
      expect(req.remote_database_secret_id).toBe(REMOTE_DATABASE_SECRET_ID);
      return new Response(JSON.stringify(CORE_TABLE_FAKE_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const res = await postTable(
      workspace,
      key,
      space.sId,
      dataSourceView.dataSource.sId,
      {
        table_id: "fooTable-1",
        name: "footable",
        description: "desc",
        title: "Wonderful table",
        mime_type: "text/csv",
        remote_database_table_id: REMOTE_DATABASE_TABLE_ID,
        remote_database_secret_id: REMOTE_DATABASE_SECRET_ID,
      }
    );

    expect(res.status).toBe(200);
    expect(internalFetch).toHaveBeenCalledTimes(1);
  });
});
