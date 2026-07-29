import { Authenticator } from "@app/lib/auth";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

describe("ActivationPodResource", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let projectSpace: SpaceResource;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    projectSpace = await SpaceFactory.project(workspace);
  });

  describe("listWorkspaceModelIdsWithActivationPods", () => {
    it("returns the workspace of an activation pod", async () => {
      const user = await UserFactory.basic();
      await ActivationPodResource.makeNew(auth, { pod: projectSpace, user });

      const workspaceIds =
        await ActivationPodResource.listWorkspaceModelIdsWithActivationPods();

      expect(workspaceIds).toContain(workspace.id);
    });

    it("dedupes workspaces with multiple activation pods", async () => {
      const secondProjectSpace = await SpaceFactory.project(workspace);
      const userA = await UserFactory.basic();
      const userB = await UserFactory.basic();

      await ActivationPodResource.makeNew(auth, {
        pod: projectSpace,
        user: userA,
      });
      await ActivationPodResource.makeNew(auth, {
        pod: secondProjectSpace,
        user: userB,
      });

      const workspaceIds =
        await ActivationPodResource.listWorkspaceModelIdsWithActivationPods();

      expect(workspaceIds.filter((id) => id === workspace.id)).toHaveLength(1);
    });

    it("excludes workspaces without an activation pod", async () => {
      const workspaceIds =
        await ActivationPodResource.listWorkspaceModelIdsWithActivationPods();

      expect(workspaceIds).not.toContain(workspace.id);
    });

    it("excludes workspaces whose only pod has been deleted", async () => {
      const user = await UserFactory.basic();
      const pod = await ActivationPodResource.makeNew(auth, {
        pod: projectSpace,
        user,
      });
      await pod.delete(auth, {});

      const otherWorkspace = await WorkspaceFactory.basic();
      const otherAuth = await Authenticator.internalAdminForWorkspace(
        otherWorkspace.sId
      );
      const otherProjectSpace = await SpaceFactory.project(otherWorkspace);
      const otherUser = await UserFactory.basic();
      await ActivationPodResource.makeNew(otherAuth, {
        pod: otherProjectSpace,
        user: otherUser,
      });

      const workspaceIds =
        await ActivationPodResource.listWorkspaceModelIdsWithActivationPods();

      expect(workspaceIds).not.toContain(workspace.id);
      expect(workspaceIds).toContain(otherWorkspace.id);
    });
  });
});
