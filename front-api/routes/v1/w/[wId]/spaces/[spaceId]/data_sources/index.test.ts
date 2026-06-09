import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { expectArrayOfObjectsWithSpecificLength } from "@app/tests/utils/utils";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getDataSources(
  workspace: { sId: string },
  spaceSId: string,
  key: { secret: string }
) {
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/spaces/${spaceSId}/data_sources`,
    {
      headers: { authorization: `Bearer ${key.secret}` },
    }
  );
}

describe("GET /api/v1/w/:wId/spaces/:spaceId/data_sources", () => {
  it("returns an empty list when no data sources exist", async () => {
    const { workspace, globalGroup, key } = await createPublicApiMockRequest();

    const space = await SpaceFactory.global(workspace);
    await GroupSpaceFactory.associate(space, globalGroup);

    const response = await getDataSources(workspace, space.sId, key);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data_sources: [] });
  });

  it("returns accessible data sources for the space", async () => {
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
    const response = await getDataSources(workspace, space.sId, key);

    // Verify response
    expect(response.status).toBe(200);

    const { data_sources } = await response.json();
    expectArrayOfObjectsWithSpecificLength(data_sources, 2);
  });
});
