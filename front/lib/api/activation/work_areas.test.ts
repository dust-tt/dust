import {
  listActivationWorkAreasForUser,
  updateActivationWorkAreaForUser,
} from "@app/lib/api/activation/work_areas";
import { Authenticator } from "@app/lib/auth";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { ActivationWorkAreaResource } from "@app/lib/resources/activation_work_area_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { describe, expect, it } from "vitest";

async function createActivationPod(
  auth: Authenticator,
  workspace: ReturnType<Authenticator["getNonNullableWorkspace"]>
) {
  const user = auth.getNonNullableUser();
  const pod = await SpaceFactory.project(workspace, user.id);
  await ProjectMetadataResource.makeNew(auth, pod, { description: null });
  await ActivationPodResource.makeNew(auth, { pod, user });
  await auth.refresh();
  return pod;
}

describe("listActivationWorkAreasForUser", () => {
  it("lists work areas for a pod the caller can write", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "user",
    });
    const pod = await createActivationPod(authenticator, workspace);
    const activationPod = await ActivationPodResource.fetchBySpace(
      authenticator,
      pod
    );
    expect(activationPod).not.toBeNull();

    await ActivationWorkAreaResource.makeNew(authenticator, {
      title: "Weekly reporting",
      description: "Automate the weekly report.",
      podId: activationPod!.id,
    });

    const workAreas = await listActivationWorkAreasForUser(authenticator, {
      podId: pod.sId,
    });

    expect(workAreas).toEqual([
      expect.objectContaining({ title: "Weekly reporting" }),
    ]);
  });

  it("does not list work areas for a pod the caller cannot write", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "user",
    });
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );
    const otherPod = await createActivationPod(otherAuth, workspace);
    const otherActivationPod = await ActivationPodResource.fetchBySpace(
      otherAuth,
      otherPod
    );
    expect(otherActivationPod).not.toBeNull();

    await ActivationWorkAreaResource.makeNew(otherAuth, {
      title: "Other user's area",
      description: "Should not be visible.",
      podId: otherActivationPod!.id,
    });

    const workAreas = await listActivationWorkAreasForUser(authenticator, {
      podId: otherPod.sId,
    });

    expect(workAreas).toEqual([]);
  });

  it("lets a workspace admin list work areas on another member's pod", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "admin",
    });
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );
    const otherPod = await createActivationPod(otherAuth, workspace);
    const otherActivationPod = await ActivationPodResource.fetchBySpace(
      otherAuth,
      otherPod
    );
    expect(otherActivationPod).not.toBeNull();

    await ActivationWorkAreaResource.makeNew(otherAuth, {
      title: "Pipeline management",
      description: "Keep active opportunities moving toward close.",
      podId: otherActivationPod!.id,
    });

    const workAreas = await listActivationWorkAreasForUser(authenticator, {
      podId: otherPod.sId,
    });

    expect(workAreas).toEqual([
      expect.objectContaining({ title: "Pipeline management" }),
    ]);
  });
});

describe("updateActivationWorkAreaForUser", () => {
  it("returns not_found when the caller cannot write the work area's pod", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "user",
    });
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );
    const otherPod = await createActivationPod(otherAuth, workspace);
    const otherActivationPod = await ActivationPodResource.fetchBySpace(
      otherAuth,
      otherPod
    );
    expect(otherActivationPod).not.toBeNull();

    const workArea = await ActivationWorkAreaResource.makeNew(otherAuth, {
      title: "Other user's area",
      description: "Should not be updatable.",
      podId: otherActivationPod!.id,
    });

    const result = await updateActivationWorkAreaForUser(authenticator, {
      workAreaId: workArea.sId,
      status: "dismissed",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("activation_work_area_not_found");
    }
  });

  it("lets a workspace admin update a work area on another member's pod", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "admin",
    });
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );
    const otherPod = await createActivationPod(otherAuth, workspace);
    const otherActivationPod = await ActivationPodResource.fetchBySpace(
      otherAuth,
      otherPod
    );
    expect(otherActivationPod).not.toBeNull();

    const workArea = await ActivationWorkAreaResource.makeNew(otherAuth, {
      title: "Pipeline management",
      description: "Keep active opportunities moving toward close.",
      podId: otherActivationPod!.id,
    });

    const result = await updateActivationWorkAreaForUser(authenticator, {
      workAreaId: workArea.sId,
      status: "dismissed",
    });

    expect(result.isOk()).toBe(true);

    const workAreas = await listActivationWorkAreasForUser(authenticator, {
      podId: otherPod.sId,
    });
    expect(workAreas).toEqual([
      expect.objectContaining({
        title: "Pipeline management",
        status: "dismissed",
      }),
    ]);
  });
});
