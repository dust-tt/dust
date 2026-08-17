import { Authenticator } from "@app/lib/auth";
import { PodAppShareResource } from "@app/lib/resources/pod_app_share_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { PodAppShareFactory } from "@app/tests/utils/PodAppShareFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import assert from "assert";
import { describe, expect, it } from "vitest";

async function setup() {
  const { workspace, user } = await createResourceTest({ role: "admin" });
  const pod = await SpaceFactory.project(workspace, user.id);
  // Rebuild the authenticator after pod creation so it carries the editor group membership.
  const editorAuth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  const outsider = await UserFactory.basic();
  await MembershipFactory.associate(workspace, outsider, { role: "user" });
  const outsiderAuth = await Authenticator.fromUserIdAndWorkspaceId(
    outsider.sId,
    workspace.sId
  );

  return { workspace, pod, editorAuth, outsiderAuth };
}

describe("PodAppShareResource", () => {
  it("creates and fetches a share by pod/app and by server id", async () => {
    const { pod, editorAuth } = await setup();

    const share = await PodAppShareFactory.create(editorAuth, {
      space: pod,
      appName: "notes",
      internalMCPServerId: "ims_abc123",
      toolsetName: "Notes",
      description: "Note-taking tools.",
    });

    expect(share.appName).toBe("notes");
    expect(share.toolsetName).toBe("Notes");
    expect(share.space.id).toBe(pod.id);

    const byPrefix = await PodAppShareResource.fetchByPodAndAppName(
      editorAuth,
      pod,
      "notes"
    );
    expect(byPrefix?.id).toBe(share.id);

    const byServerId = await PodAppShareResource.fetchByInternalMCPServerId(
      editorAuth,
      "ims_abc123"
    );
    expect(byServerId?.id).toBe(share.id);
    expect(byServerId?.space.id).toBe(pod.id);
  });

  it("rejects creation by a non-editor and on a non-project space", async () => {
    const { pod, outsiderAuth, editorAuth } = await setup();

    await expect(
      PodAppShareFactory.create(outsiderAuth, {
        space: pod,
        appName: "notes",
      })
    ).rejects.toThrow("Only pod editors");

    const { globalSpace } = await createResourceTest({ role: "admin" });
    assert(globalSpace, "Expected a global space");
    await expect(
      PodAppShareFactory.create(editorAuth, {
        space: globalSpace,
        appName: "notes",
      })
    ).rejects.toThrow("can only belong to pods");
  });

  it("revoke soft-deletes and allows re-sharing the same app", async () => {
    const { pod, editorAuth } = await setup();

    const share = await PodAppShareFactory.create(editorAuth, {
      space: pod,
      appName: "notes",
      internalMCPServerId: "ims_first",
    });

    await share.revoke(editorAuth);

    expect(
      await PodAppShareResource.fetchByPodAndAppName(editorAuth, pod, "notes")
    ).toBeNull();
    expect(
      await PodAppShareResource.fetchByInternalMCPServerId(
        editorAuth,
        "ims_first"
      )
    ).toBeNull();

    // The partial unique index only covers active rows, so re-sharing succeeds.
    const reshared = await PodAppShareFactory.create(editorAuth, {
      space: pod,
      appName: "notes",
      internalMCPServerId: "ims_second",
    });
    expect(reshared.appName).toBe("notes");
  });

  it("revoke is editor-gated", async () => {
    const { pod, editorAuth, outsiderAuth } = await setup();

    const share = await PodAppShareFactory.create(editorAuth, {
      space: pod,
      appName: "notes",
    });

    await expect(share.revoke(outsiderAuth)).rejects.toThrow(
      "Only pod editors"
    );
  });

  it("lists only the pod's active shares", async () => {
    const { workspace, pod, editorAuth } = await setup();

    const otherPod = await SpaceFactory.project(workspace);
    const adminAuth = editorAuth;

    const shareA = await PodAppShareFactory.create(adminAuth, {
      space: pod,
      appName: "notes",
      internalMCPServerId: "ims_a",
    });
    const shareB = await PodAppShareFactory.create(adminAuth, {
      space: pod,
      appName: "tasks",
      internalMCPServerId: "ims_b",
    });
    await shareB.revoke(adminAuth);

    const listed = await PodAppShareResource.listBySpace(adminAuth, pod);
    expect(listed.map(({ id }) => id)).toEqual([shareA.id]);

    expect(await PodAppShareResource.listBySpace(adminAuth, otherPod)).toEqual(
      []
    );
  });

  it("updateShareDetails updates the mirror columns", async () => {
    const { pod, editorAuth } = await setup();

    const share = await PodAppShareFactory.create(editorAuth, {
      space: pod,
      appName: "notes",
    });

    await share.updateShareDetails({
      toolsetName: "Better Notes",
      description: "Improved.",
    });
    expect(share.toolsetName).toBe("Better Notes");
    expect(share.description).toBe("Improved.");

    const fetched = await PodAppShareResource.fetchByPodAndAppName(
      editorAuth,
      pod,
      "notes"
    );
    expect(fetched?.toolsetName).toBe("Better Notes");
    expect(fetched?.description).toBe("Improved.");
  });
});
