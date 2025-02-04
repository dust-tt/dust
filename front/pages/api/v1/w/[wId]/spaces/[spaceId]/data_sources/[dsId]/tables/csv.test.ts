import { describe, vi } from "vitest";
import { expect } from "vitest";

import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import {
  createPublicApiMockRequest,
  createPublicApiSystemOnlyAuthenticationTests,
} from "@app/tests/utils/generic_public_api_tests";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./csv";

const CORE_FAKE_RESPONSE = {
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
      remote_database_table_id: null,
      remote_database_secret_id: null,
    },
  },
};
describe(
  "system-only authentication tests",
  createPublicApiSystemOnlyAuthenticationTests(handler)
);

vi.mock(import("@app/lib/api/config"), (() => ({
  default: {
    getCoreAPIConfig: vi.fn().mockReturnValue({
      url: "http://localhost:9999",
      apiKey: "foo",
    }),
  },
})) as any);

describe("POST /api/v1/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/tables/csv", () => {
  itInTransaction("returns when called with a valid CSV", async (t) => {
    const { req, res, workspace, globalGroup } =
      await createPublicApiMockRequest({
        systemKey: true,
        method: "POST",
      });

    const space = await SpaceFactory.global(workspace, t);
    await GroupSpaceFactory.associate(space, globalGroup);
    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      space,
      t
    );

    req.query.spaceId = space.sId;
    req.query.dsId = dataSourceView.dataSource.sId;

    req.body = {
      name: "footable",
      truncate: true,
      title: "Wonderful table",
      mimeType: "text/csv",
      description: "desc",
      csv: "foo,bar,viz\n1,2,3\n4,5,6",
      tableId: "fooTable-1",
    };

    // First fetch is to create the table
    global.fetch = vi.fn().mockImplementation(async (url, init) => {
      const req = JSON.parse(init.body);

      if ((url as string).endsWith("/tables")) {
        expect(req.table_id).toBe("fooTable-1");
        expect(req.name).toBe("footable");
        expect(req.parents[0]).toBe("fooTable-1");
        expect(req.source_url).toBeNull();
        return Promise.resolve(
          new Response(JSON.stringify(CORE_FAKE_RESPONSE), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }

      if ((url as string).endsWith("/rows")) {
        expect(req.rows[0].row_id).toBe("0");
        expect(req.rows[0].value.bar).toBe(2);
        expect(req.rows[1].value.foo).toBe(4);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              response: {
                success: true,
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          )
        );
      }
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual(CORE_FAKE_RESPONSE.response);
  });
});
