import { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  deleteMembersActivity,
  deleteSpacesActivity,
  getGitHubAdminEmailsActivity,
  scrubSpaceActivity,
  sendGitHubNoticesActivity,
} from "@app/poke/temporal/activities";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockHardDeleteDataSource, mockSendGitHubDeletionEmail } = vi.hoisted(
  () => ({
    mockHardDeleteDataSource: vi.fn(),
    mockSendGitHubDeletionEmail: vi.fn(),
  })
);

beforeEach(() => {
  mockHardDeleteDataSource.mockReset();
  mockHardDeleteDataSource.mockImplementation(
    async (auth: Authenticator, dataSource: DataSourceResource) => {
      const result = await dataSource.delete(auth, { hardDelete: true });
      if (result.isErr()) {
        throw result.error;
      }
    }
  );
  mockSendGitHubDeletionEmail.mockReset();
});

vi.mock("@app/lib/api/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/api/email")>();
  return {
    ...actual,
    sendGitHubDeletionEmail: mockSendGitHubDeletionEmail,
  };
});

vi.mock("@app/lib/api/data_sources", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/data_sources")>();
  return {
    ...actual,
    hardDeleteDataSource: mockHardDeleteDataSource,
  };
});

describe("deleteMembersActivity", () => {
  it("deletes memberships for users who belong to another workspace", async () => {
    const workspace = await WorkspaceFactory.byok();
    const otherWorkspace = await WorkspaceFactory.byok();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    await MembershipFactory.associate(otherWorkspace, user, { role: "user" });

    await deleteMembersActivity({ workspaceId: workspace.sId });

    await expect(
      MembershipResource.getActiveMembershipOfUserInWorkspace({
        user,
        workspace,
      })
    ).resolves.toBeNull();
    await expect(
      MembershipResource.getActiveMembershipOfUserInWorkspace({
        user,
        workspace: otherWorkspace,
      })
    ).resolves.not.toBeNull();
  });

  it("notifies admins after deleting a workspace with GitHub data", async () => {
    const workspace = await WorkspaceFactory.byok();
    const admin = await UserFactory.basic();
    await MembershipFactory.associate(workspace, admin, { role: "admin" });
    const globalSpace = await SpaceFactory.global(workspace);
    await DataSourceViewFactory.fromConnector(workspace, globalSpace, "github");

    const githubAdminEmails = await getGitHubAdminEmailsActivity({
      workspaceId: workspace.sId,
    });
    await deleteMembersActivity({ workspaceId: workspace.sId });
    expect(mockSendGitHubDeletionEmail).not.toHaveBeenCalled();

    await deleteSpacesActivity({ workspaceId: workspace.sId });
    expect(mockSendGitHubDeletionEmail).not.toHaveBeenCalled();
    expect(mockHardDeleteDataSource).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { warnAdmins: false }
    );

    await sendGitHubNoticesActivity({ adminEmails: githubAdminEmails });

    expect(mockSendGitHubDeletionEmail).toHaveBeenCalledWith(admin.email);
  });
});

describe("scrubSpaceActivity", () => {
  it("keeps GitHub admin warnings for standalone space deletion", async () => {
    const workspace = await WorkspaceFactory.byok();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const space = await SpaceFactory.regular(workspace);
    const view = await DataSourceViewFactory.fromConnector(
      workspace,
      space,
      "github"
    );

    await view.delete(auth, { hardDelete: false });
    await view.dataSource.delete(auth, { hardDelete: false });
    const spaceDeleteResult = await space.delete(auth, { hardDelete: false });
    expect(spaceDeleteResult.isOk()).toBe(true);

    await scrubSpaceActivity({
      spaceId: space.sId,
      workspaceId: workspace.sId,
    });

    expect(mockHardDeleteDataSource).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { warnAdmins: true }
    );
  });
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
