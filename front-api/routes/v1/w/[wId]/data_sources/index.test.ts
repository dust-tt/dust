import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { expectArrayOfObjectsWithSpecificLength } from "@app/tests/utils/utils";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getDataSources(workspace: { sId: string }, key: { secret: string }) {
  return honoApp.request(`/api/v1/w/${workspace.sId}/data_sources`, {
    headers: { authorization: `Bearer ${key.secret}` },
  });
}

describe("GET /api/v1/w/:wId/data_sources (legacy endpoint)", () => {
  it("returns 500 if no global space exists", async () => {
    const { workspace, key } = await createPublicApiMockRequest();

    const response = await getDataSources(workspace, key);

    expect(response.status).toBe(500);
  });

  it("returns data sources for the global space", async () => {
    const { workspace, globalGroup, key } = await createPublicApiMockRequest();

    const space = await SpaceFactory.global(workspace);
    await GroupSpaceFactory.associate(space, globalGroup);

    // Create test data source views to the space
    await DataSourceViewFactory.folder(workspace, space);
    await DataSourceViewFactory.folder(workspace, space);

    // Create another space
    const space2 = await SpaceFactory.regular(workspace);

    // Create test data source views to the space (they should not be returned)
    await DataSourceViewFactory.folder(workspace, space2);

    // Execute request
    const response = await getDataSources(workspace, key);

    // Verify response
    expect(response.status).toBe(200);

    const { data_sources } = await response.json();
    expectArrayOfObjectsWithSpecificLength(data_sources, 2);
  });
});
