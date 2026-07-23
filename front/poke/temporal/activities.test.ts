import { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { deleteSpacesActivity } from "@app/poke/temporal/activities";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/data_sources", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/data_sources")>();
  return {
    ...actual,
    hardDeleteDataSource: vi.fn(
      async (auth: Authenticator, dataSource: DataSourceResource) => {
        const result = await dataSource.delete(auth, { hardDelete: true });
        if (result.isErr()) {
          throw result.error;
        }
      }
    ),
  };
});

describe("deleteSpacesActivity", () => {
  it("deletes a data source shared with a later space", async () => {
    const workspace = await WorkspaceFactory.byok();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const ownerSpace = await SpaceFactory.regular(workspace);
    const laterSpace = await SpaceFactory.regular(workspace);
    const defaultView = await DataSourceViewFactory.folder(
      workspace,
      ownerSpace
    );

    const sharedView =
      await DataSourceViewResource.createViewInSpaceFromDataSource(
        auth,
        laterSpace,
        defaultView.dataSource,
        ["node"]
      );
    expect(sharedView.isOk()).toBe(true);

    await deleteSpacesActivity({ workspaceId: workspace.sId });

    await expect(
      DataSourceResource.fetchById(auth, defaultView.dataSource.sId, {
        includeDeleted: true,
      })
    ).resolves.toBeNull();
    await expect(
      SpaceResource.fetchById(auth, ownerSpace.sId, { includeDeleted: true })
    ).resolves.toBeNull();
    await expect(
      SpaceResource.fetchById(auth, laterSpace.sId, { includeDeleted: true })
    ).resolves.toBeNull();
  });
});
