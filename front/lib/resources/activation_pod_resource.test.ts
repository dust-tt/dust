import { Authenticator } from "@app/lib/auth";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

async function makeActivationPod(
  auth: Authenticator,
  pod: SpaceResource,
  user: UserResource,
  { archivedAt = null }: { archivedAt?: Date | null } = {}
) {
  await ProjectMetadataResource.makeNew(auth, pod, {
    description: null,
    archivedAt,
  });
  return ActivationPodResource.makeNew(auth, { pod, user });
}

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
      await makeActivationPod(auth, projectSpace, user);

      const workspaceIds =
        await ActivationPodResource.listWorkspaceModelIdsWithActivationPods();

      expect(workspaceIds).toContain(workspace.id);
    });

    it("dedupes workspaces with multiple activation pods", async () => {
      const secondProjectSpace = await SpaceFactory.project(workspace);
      const userA = await UserFactory.basic();
      const userB = await UserFactory.basic();

      await makeActivationPod(auth, projectSpace, userA);
      await makeActivationPod(auth, secondProjectSpace, userB);

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
      const pod = await makeActivationPod(auth, projectSpace, user);
      await pod.delete(auth, {});

      const otherWorkspace = await WorkspaceFactory.basic();
      const otherAuth = await Authenticator.internalAdminForWorkspace(
        otherWorkspace.sId
      );
      const otherProjectSpace = await SpaceFactory.project(otherWorkspace);
      const otherUser = await UserFactory.basic();
      await makeActivationPod(otherAuth, otherProjectSpace, otherUser);

      const workspaceIds =
        await ActivationPodResource.listWorkspaceModelIdsWithActivationPods();

      expect(workspaceIds).not.toContain(workspace.id);
      expect(workspaceIds).toContain(otherWorkspace.id);
    });

    it("excludes workspaces whose only activation pod is archived", async () => {
      const user = await UserFactory.basic();
      await makeActivationPod(auth, projectSpace, user, {
        archivedAt: new Date(),
      });

      const workspaceIds =
        await ActivationPodResource.listWorkspaceModelIdsWithActivationPods();

      expect(workspaceIds).not.toContain(workspace.id);
    });
  });

  describe("fetchByUser", () => {
    it("returns the user's live activation pod", async () => {
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "user" });
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );
      await makeActivationPod(userAuth, projectSpace, user);

      const fetched = await ActivationPodResource.fetchByUser(userAuth);
      expect(fetched?.spaceId).toBe(projectSpace.id);
    });

    it("returns null when the user's only activation pod is archived", async () => {
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "user" });
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );
      await makeActivationPod(userAuth, projectSpace, user, {
        archivedAt: new Date(),
      });

      expect(await ActivationPodResource.fetchByUser(userAuth)).toBeNull();
    });

    it("skips a newer archived pod in favor of an older live one", async () => {
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "user" });
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );
      await makeActivationPod(userAuth, projectSpace, user);

      const archivedSpace = await SpaceFactory.project(workspace);
      await makeActivationPod(userAuth, archivedSpace, user, {
        archivedAt: new Date(),
      });

      const fetched = await ActivationPodResource.fetchByUser(userAuth);
      expect(fetched?.spaceId).toBe(projectSpace.id);
    });
  });

  describe("fetchBySpace", () => {
    it("returns null for an archived pod", async () => {
      const user = await UserFactory.basic();
      await makeActivationPod(auth, projectSpace, user, {
        archivedAt: new Date(),
      });

      expect(
        await ActivationPodResource.fetchBySpace(auth, projectSpace)
      ).toBeNull();
    });
  });
});
