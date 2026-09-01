import { Authenticator } from "@app/lib/auth";
import { AgentModel } from "@app/lib/models/agent/agent";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { ActivationWorkAreaResource } from "@app/lib/resources/activation_work_area_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  deleteAgentsActivity,
  deleteSpacesActivity,
} from "@app/poke/temporal/activities";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
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

describe("deleteAgentsActivity", () => {
  it("deletes stable agent identities left by a partial previous run", async () => {
    const workspace = await WorkspaceFactory.byok();
    await AgentModel.create({
      sId: "agent-test",
      workspaceId: workspace.id,
    });

    await deleteAgentsActivity({ workspaceId: workspace.sId });

    await expect(
      AgentModel.count({ where: { workspaceId: workspace.id } })
    ).resolves.toBe(0);
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

  it("deletes the work areas of an activation pod before its space", async () => {
    const workspace = await WorkspaceFactory.byok();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const pod = await SpaceFactory.project(workspace, user.id);
    const activationPod = await ActivationPodResource.makeNew(auth, {
      pod,
      user,
    });
    await ActivationWorkAreaResource.makeNew(auth, {
      title: "Weekly reporting",
      description: "Automate the weekly report.",
      podId: activationPod.id,
    });

    await deleteSpacesActivity({ workspaceId: workspace.sId });

    await expect(
      SpaceResource.fetchById(auth, pod.sId, { includeDeleted: true })
    ).resolves.toBeNull();
    await expect(
      ActivationWorkAreaResource.listByActivationPods(auth, {
        activationPods: [activationPod],
      })
    ).resolves.toEqual([]);
  });
});
