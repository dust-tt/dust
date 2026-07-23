import { deleteWorkspacePlugin } from "@app/lib/api/poke/plugins/workspaces/delete_workspace";
import { Authenticator } from "@app/lib/auth";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { createZodSchemaFromArgs } from "@app/types/poke/plugins";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDeleteWorkspace } = vi.hoisted(() => ({
  mockDeleteWorkspace: vi.fn(),
}));

vi.mock("@app/lib/api/workspace", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/workspace")>();
  return { ...actual, deleteWorkspace: mockDeleteWorkspace };
});

beforeEach(() => {
  mockDeleteWorkspace.mockReset();
  mockDeleteWorkspace.mockResolvedValue(new Ok(undefined));
});

describe("deleteWorkspacePlugin.execute", () => {
  it("defaults data source deletion to false", () => {
    const schema = createZodSchemaFromArgs(deleteWorkspacePlugin.manifest.args);

    const args = schema.parse({
      confirmation: "DELETE",
      workspaceHasBeenRelocated: false,
    });

    expect(args.deleteDataSources).toBe(false);
  });

  it("blocks deletion when the free-plan workspace still has an active Metronome contract", async () => {
    // Credit-priced free plan: `isFreePlan` is true, yet the active subscription
    // is Metronome-billed — the case the guard must catch.
    const workspace = await WorkspaceFactory.creditPricedFree();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const result = await deleteWorkspacePlugin.execute(auth, workspace, {
      confirmation: "DELETE",
      workspaceHasBeenRelocated: false,
      deleteDataSources: false,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toMatch(/active Metronome contract/i);
    }
    expect(mockDeleteWorkspace).not.toHaveBeenCalled();
  });

  it("blocks deletion with data sources unless explicitly requested", async () => {
    const workspace = await WorkspaceFactory.byok();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const globalSpace = await SpaceFactory.global(workspace);
    await DataSourceViewFactory.folder(workspace, globalSpace);

    const result = await deleteWorkspacePlugin.execute(auth, workspace, {
      confirmation: "DELETE",
      workspaceHasBeenRelocated: false,
      deleteDataSources: false,
    });

    expect(result.isErr()).toBe(true);
    expect(mockDeleteWorkspace).not.toHaveBeenCalled();
  });

  it("keeps data source deletion disabled when the workspace has none", async () => {
    const workspace = await WorkspaceFactory.byok();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const result = await deleteWorkspacePlugin.execute(auth, workspace, {
      confirmation: "DELETE",
      workspaceHasBeenRelocated: false,
      deleteDataSources: false,
    });

    expect(result.isOk()).toBe(true);
    expect(mockDeleteWorkspace).toHaveBeenCalledWith(workspace, {
      deleteDataSources: false,
    });
  });

  it("returns workspace deletion scheduling errors", async () => {
    const workspace = await WorkspaceFactory.byok();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    mockDeleteWorkspace.mockResolvedValue(
      new Err(new Error("Failed to start deletion workflow."))
    );

    const result = await deleteWorkspacePlugin.execute(auth, workspace, {
      confirmation: "DELETE",
      workspaceHasBeenRelocated: false,
      deleteDataSources: false,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Failed to start deletion workflow.");
    }
  });

  it("proceeds with data sources when explicitly requested", async () => {
    const workspace = await WorkspaceFactory.byok();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const globalSpace = await SpaceFactory.global(workspace);
    await DataSourceViewFactory.folder(workspace, globalSpace);

    const result = await deleteWorkspacePlugin.execute(auth, workspace, {
      confirmation: "DELETE",
      workspaceHasBeenRelocated: false,
      deleteDataSources: true,
    });

    expect(result.isOk()).toBe(true);
    expect(mockDeleteWorkspace).toHaveBeenCalledWith(workspace, {
      deleteDataSources: true,
    });
  });
});
