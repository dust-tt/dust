import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { destroyForWorkspaceInBatches } from "@app/lib/resources/storage/wrappers/workspace_models";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

async function createFiles(auth: Authenticator, count: number) {
  for (let i = 0; i < count; i++) {
    await FileFactory.create(auth, null, {
      contentType: "text/plain",
      fileName: `file-${i}.txt`,
      fileSize: 10,
      status: "created",
      useCase: "conversation",
    });
  }
}

describe("destroyForWorkspaceInBatches", () => {
  it("deletes all rows for the workspace in batches and leaves other workspaces untouched", async () => {
    const { authenticator: auth1, workspace: workspace1 } =
      await createResourceTest({ role: "admin" });
    const { authenticator: auth2, workspace: workspace2 } =
      await createResourceTest({ role: "admin" });

    // 5 rows with batchSize 2 exercises a partial final batch (2 + 2 + 1).
    await createFiles(auth1, 5);
    await createFiles(auth2, 2);

    const deletedCount = await destroyForWorkspaceInBatches(FileModel, {
      workspaceId: workspace1.id,
      batchSize: 2,
    });

    expect(deletedCount).toBe(5);
    expect(
      await FileModel.count({ where: { workspaceId: workspace1.id } })
    ).toBe(0);
    expect(
      await FileModel.count({ where: { workspaceId: workspace2.id } })
    ).toBe(2);

    // No-op on an already-empty table.
    expect(
      await destroyForWorkspaceInBatches(FileModel, {
        workspaceId: workspace1.id,
      })
    ).toBe(0);
  });

  it("hard-deletes soft-deletable models, including already soft-deleted rows", async () => {
    const workspace = await WorkspaceFactory.basic();
    const space = await SpaceFactory.regular(workspace);

    const view = await DataSourceViewFactory.folder(workspace, space);
    await DataSourceViewFactory.folder(workspace, space);

    // Soft-delete one row first: the sweep must still remove it from the table.
    await DataSourceViewModel.destroy({
      where: { id: view.id, workspaceId: workspace.id },
      hardDelete: false,
    });

    // batchSize 1 exercises an exact-multiple final batch (1 + 1 + empty select).
    const deletedCount = await destroyForWorkspaceInBatches(
      DataSourceViewModel,
      {
        workspaceId: workspace.id,
        batchSize: 1,
      }
    );

    expect(deletedCount).toBe(2);
    const remaining = await DataSourceViewModel.findAll({
      where: { workspaceId: workspace.id },
      includeDeleted: true,
    });
    expect(remaining.length).toBe(0);
  });
});
