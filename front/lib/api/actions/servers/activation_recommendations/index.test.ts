import { Authenticator } from "@app/lib/auth";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { ActivationWorkAreaResource } from "@app/lib/resources/activation_work_area_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { describe, expect, it } from "vitest";

import { TOOLS } from ".";

function getTool(
  name:
    | "create_work_areas"
    | "list_work_areas"
    | "list_activation_pods"
    | "update_work_area"
) {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`${name} tool not found`);
  }
  return tool;
}

function createTestExtra(auth: Authenticator) {
  return {
    signal: new AbortController().signal,
    auth,
  } as Parameters<(typeof TOOLS)[0]["handler"]>[1];
}

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

describe("activation recommendations work-area tools", () => {
  it("creates and lists work areas for a pod the caller can administrate", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "user",
    });
    const pod = await createActivationPod(authenticator, workspace);

    const createResult = await getTool("create_work_areas").handler(
      {
        assignments: [
          {
            podIds: [pod.sId],
            workAreas: [
              {
                title: "Weekly planning",
                description: "Plan and prioritize the week's recurring work.",
              },
            ],
          },
        ],
      },
      createTestExtra(authenticator)
    );
    expect(createResult.isOk()).toBe(true);

    const listResult = await getTool("list_work_areas").handler(
      { podIds: [pod.sId] },
      createTestExtra(authenticator)
    );
    expect(listResult.isOk()).toBe(true);
    if (listResult.isOk()) {
      const [content] = listResult.value;
      expect(content.type).toBe("text");
      if (content.type === "text") {
        const payload = JSON.parse(content.text);
        expect(payload).toEqual([
          expect.objectContaining({
            podId: pod.sId,
            workAreas: [expect.objectContaining({ title: "Weekly planning" })],
          }),
        ]);
      }
    }
  });

  it("lets a workspace admin create and list work areas on other members' pods", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "admin",
    });
    const firstUser = await UserFactory.basic();
    const secondUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, firstUser, { role: "user" });
    await MembershipFactory.associate(workspace, secondUser, { role: "user" });
    const firstPod = await createActivationPod(
      await Authenticator.fromUserIdAndWorkspaceId(
        firstUser.sId,
        workspace.sId
      ),
      workspace
    );
    const secondPod = await createActivationPod(
      await Authenticator.fromUserIdAndWorkspaceId(
        secondUser.sId,
        workspace.sId
      ),
      workspace
    );

    const createResult = await getTool("create_work_areas").handler(
      {
        assignments: [
          {
            podIds: [firstPod.sId, secondPod.sId],
            workAreas: [
              {
                title: "Pipeline management",
                description: "Keep active opportunities moving toward close.",
              },
            ],
          },
        ],
      },
      createTestExtra(authenticator)
    );
    expect(createResult.isOk()).toBe(true);

    const listResult = await getTool("list_work_areas").handler(
      { podIds: [firstPod.sId, secondPod.sId] },
      createTestExtra(authenticator)
    );
    expect(listResult.isOk()).toBe(true);
    if (listResult.isOk()) {
      const [content] = listResult.value;
      expect(content.type).toBe("text");
      if (content.type === "text") {
        const payload = JSON.parse(content.text);
        expect(payload).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              podId: firstPod.sId,
              workAreas: [
                expect.objectContaining({ title: "Pipeline management" }),
              ],
            }),
            expect.objectContaining({
              podId: secondPod.sId,
              workAreas: [
                expect.objectContaining({ title: "Pipeline management" }),
              ],
            }),
          ])
        );
      }
    }
  });

  it("rejects a caller who cannot administrate the pod", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "user",
    });
    const targetUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, targetUser, { role: "user" });
    const targetPod = await createActivationPod(
      await Authenticator.fromUserIdAndWorkspaceId(
        targetUser.sId,
        workspace.sId
      ),
      workspace
    );

    const result = await getTool("create_work_areas").handler(
      {
        assignments: [
          {
            podIds: [targetPod.sId],
            workAreas: [
              {
                title: "Weekly pipeline review",
                description:
                  "Review pipeline movement and unblock active deals.",
              },
            ],
          },
        ],
      },
      createTestExtra(authenticator)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "Not authorized to manage work areas"
      );
    }
  });

  it("lists only Activation Pods the caller can administrate", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "user",
    });
    const ownPod = await createActivationPod(authenticator, workspace);
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const otherPod = await createActivationPod(
      await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      ),
      workspace
    );

    const result = await getTool("list_activation_pods").handler(
      {},
      createTestExtra(authenticator)
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const [content] = result.value;
      expect(content.type).toBe("text");
      if (content.type === "text") {
        const payload = JSON.parse(content.text);
        expect(payload).toEqual([
          expect.objectContaining({
            podId: ownPod.sId,
            name: ownPod.name,
          }),
        ]);
        expect(payload).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ podId: otherPod.sId }),
          ])
        );
      }
    }
  });

  it("lets a workspace admin list other members' Activation Pods", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "admin",
    });
    const targetUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, targetUser, { role: "user" });
    const targetPod = await createActivationPod(
      await Authenticator.fromUserIdAndWorkspaceId(
        targetUser.sId,
        workspace.sId
      ),
      workspace
    );

    const result = await getTool("list_activation_pods").handler(
      {},
      createTestExtra(authenticator)
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const [content] = result.value;
      expect(content.type).toBe("text");
      if (content.type === "text") {
        const payload = JSON.parse(content.text);
        expect(payload).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              podId: targetPod.sId,
              name: targetPod.name,
            }),
          ])
        );
      }
    }
  });

  it("rejects a pod appearing in multiple assignments", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "user",
    });
    const pod = await createActivationPod(authenticator, workspace);

    const result = await getTool("create_work_areas").handler(
      {
        assignments: [
          {
            podIds: [pod.sId],
            workAreas: [
              {
                title: "Pipeline management",
                description: "Keep active opportunities moving toward close.",
              },
            ],
          },
          {
            podIds: [pod.sId],
            workAreas: [
              {
                title: "Renewal planning",
                description:
                  "Prepare account renewal strategies and next steps.",
              },
            ],
          },
        ],
      },
      createTestExtra(authenticator)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Each pod may appear in only one");
    }
  });

  it("returns the same not-found error for missing and unauthorized work areas", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "user",
    });
    const targetUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, targetUser, { role: "user" });
    const targetAuth = await Authenticator.fromUserIdAndWorkspaceId(
      targetUser.sId,
      workspace.sId
    );
    const targetPod = await createActivationPod(targetAuth, workspace);
    const targetActivationPod = await ActivationPodResource.fetchBySpace(
      targetAuth,
      targetPod
    );
    expect(targetActivationPod).not.toBeNull();

    const workArea = await ActivationWorkAreaResource.makeNew(targetAuth, {
      title: "Other user's area",
      description: "Should not leak existence.",
      podId: targetActivationPod!.id,
    });

    const missing = await getTool("update_work_area").handler(
      { workAreaId: "awa_does_not_exist", status: "dismissed" },
      createTestExtra(authenticator)
    );
    const unauthorized = await getTool("update_work_area").handler(
      { workAreaId: workArea.sId, status: "dismissed" },
      createTestExtra(authenticator)
    );

    expect(missing.isErr()).toBe(true);
    expect(unauthorized.isErr()).toBe(true);
    if (missing.isErr() && unauthorized.isErr()) {
      expect(missing.error.message).toBe("Work area not found.");
      expect(unauthorized.error.message).toBe(missing.error.message);
    }
  });
});
