import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
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

function getCreateWorkAreasTool() {
  const tool = TOOLS.find(
    (candidate) => candidate.name === "create_work_areas"
  );
  if (!tool) {
    throw new Error("create_work_areas tool not found");
  }
  return tool;
}

function getListWorkAreasTool() {
  const tool = TOOLS.find((candidate) => candidate.name === "list_work_areas");
  if (!tool) {
    throw new Error("list_work_areas tool not found");
  }
  return tool;
}

function createTestExtra(
  auth: Authenticator,
  podId?: string
): ToolHandlerExtra {
  return {
    auth,
    requestId: "activation-recommendations-work-area-test",
    // @ts-expect-error Handlers only read conversation.spaceId from the agent-loop run context.
    runContext: podId
      ? {
          contextType: "agent_loop",
          conversation: { spaceId: podId },
        }
      : undefined,
    sendNotification: async () => {},
    sendRequest: async () => {
      throw new Error("Unexpected MCP request");
    },
    signal: new AbortController().signal,
  };
}

async function createActivationPodForCaller(
  auth: Authenticator,
  workspace: ReturnType<Authenticator["getNonNullableWorkspace"]>
) {
  const user = auth.getNonNullableUser();
  const pod = await SpaceFactory.project(workspace, user.id);
  await ProjectMetadataResource.makeNew(auth, pod, { description: null });
  await ActivationPodResource.makeNew(auth, { pod, user });
  return pod;
}

describe("activation recommendations work-area tools", () => {
  it("uses the bulk-capable tools for the current user's Activation Pod", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "user",
    });
    const pod = await createActivationPodForCaller(authenticator, workspace);

    const createResult = await getCreateWorkAreasTool().handler(
      {
        podId: pod.sId,
        assignments: [
          {
            workAreas: [
              {
                title: "Weekly planning",
                description: "Plan and prioritize the week's recurring work.",
              },
            ],
          },
        ],
      },
      createTestExtra(authenticator, pod.sId)
    );
    expect(createResult.isOk()).toBe(true);

    const listResult = await getListWorkAreasTool().handler(
      { podId: pod.sId },
      createTestExtra(authenticator, pod.sId)
    );
    expect(listResult.isOk()).toBe(true);
    if (listResult.isOk()) {
      const [content] = listResult.value;
      expect(content.type).toBe("text");
      if (content.type === "text") {
        expect(content.text).toContain('"title":"Weekly planning"');
      }
    }

    const toolNames: string[] = TOOLS.map((tool) => tool.name);
    expect(toolNames).not.toContain("bulk_create_work_areas");
    expect(toolNames).not.toContain("bulk_list_work_areas");
  });

  it("lets an admin save user-level work areas for another active member", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "admin",
    });
    const pod = await createActivationPodForCaller(authenticator, workspace);
    const targetUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, targetUser, { role: "user" });
    await createActivationPodForCaller(
      await Authenticator.fromUserIdAndWorkspaceId(
        targetUser.sId,
        workspace.sId
      ),
      workspace
    );

    const result = await getCreateWorkAreasTool().handler(
      {
        assignments: [
          {
            targetUserIds: [targetUser.sId],
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
      createTestExtra(authenticator, pod.sId)
    );

    expect(result.isOk()).toBe(true);
    const rows = await ActivationWorkAreaResource.listByUserAndStatus(
      authenticator,
      { user: targetUser }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: targetUser.id,
      title: "Weekly pipeline review",
    });
  });

  it("rejects delegated writes from a non-admin", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "user",
    });
    const pod = await createActivationPodForCaller(authenticator, workspace);
    const targetUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, targetUser, { role: "user" });

    const result = await getCreateWorkAreasTool().handler(
      {
        assignments: [
          {
            targetUserIds: [targetUser.sId],
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
      createTestExtra(authenticator, pod.sId)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Only workspace admins");
    }
  });

  it("rejects delegated writes for a user outside the workspace", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "admin",
    });
    const pod = await createActivationPodForCaller(authenticator, workspace);
    const targetUser = await UserFactory.basic();

    const result = await getCreateWorkAreasTool().handler(
      {
        assignments: [
          {
            targetUserIds: [targetUser.sId],
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
      createTestExtra(authenticator, pod.sId)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "is not an active member of this workspace"
      );
    }
  });

  it("bulk-saves shared cohort maps and individual exceptions as user-level rows", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "admin",
    });
    const pod = await createActivationPodForCaller(authenticator, workspace);
    const firstCohortUser = await UserFactory.basic();
    const secondCohortUser = await UserFactory.basic();
    const exceptionUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, firstCohortUser, {
      role: "user",
    });
    await MembershipFactory.associate(workspace, secondCohortUser, {
      role: "user",
    });
    await MembershipFactory.associate(workspace, exceptionUser, {
      role: "user",
    });
    await Promise.all([
      createActivationPodForCaller(
        await Authenticator.fromUserIdAndWorkspaceId(
          firstCohortUser.sId,
          workspace.sId
        ),
        workspace
      ),
      createActivationPodForCaller(
        await Authenticator.fromUserIdAndWorkspaceId(
          secondCohortUser.sId,
          workspace.sId
        ),
        workspace
      ),
      createActivationPodForCaller(
        await Authenticator.fromUserIdAndWorkspaceId(
          exceptionUser.sId,
          workspace.sId
        ),
        workspace
      ),
    ]);

    const result = await getCreateWorkAreasTool().handler(
      {
        assignments: [
          {
            targetUserIds: [firstCohortUser.sId, secondCohortUser.sId],
            workAreas: [
              {
                title: "Pipeline management",
                description: "Keep active opportunities moving toward close.",
              },
            ],
          },
          {
            targetUserIds: [exceptionUser.sId],
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
      createTestExtra(authenticator, pod.sId)
    );

    expect(result.isOk()).toBe(true);
    const [firstRows, secondRows, exceptionRows] = await Promise.all([
      ActivationWorkAreaResource.listByUserAndStatus(authenticator, {
        user: firstCohortUser,
      }),
      ActivationWorkAreaResource.listByUserAndStatus(authenticator, {
        user: secondCohortUser,
      }),
      ActivationWorkAreaResource.listByUserAndStatus(authenticator, {
        user: exceptionUser,
      }),
    ]);
    expect(firstRows).toMatchObject([{ title: "Pipeline management" }]);
    expect(secondRows).toMatchObject([{ title: "Pipeline management" }]);
    expect(exceptionRows).toMatchObject([{ title: "Renewal planning" }]);
  });

  it("rejects a user appearing in multiple bulk assignments", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "admin",
    });
    const pod = await createActivationPodForCaller(authenticator, workspace);
    const targetUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, targetUser, { role: "user" });

    const result = await getCreateWorkAreasTool().handler(
      {
        assignments: [
          {
            targetUserIds: [targetUser.sId],
            workAreas: [
              {
                title: "Pipeline management",
                description: "Keep active opportunities moving toward close.",
              },
            ],
          },
          {
            targetUserIds: [targetUser.sId],
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
      createTestExtra(authenticator, pod.sId)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "Each target user may appear in only one"
      );
    }
  });

  it("rejects bulk writes from a non-admin", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "user",
    });
    const pod = await createActivationPodForCaller(authenticator, workspace);
    const targetUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, targetUser, { role: "user" });

    const result = await getCreateWorkAreasTool().handler(
      {
        assignments: [
          {
            targetUserIds: [targetUser.sId],
            workAreas: [
              {
                title: "Pipeline management",
                description: "Keep active opportunities moving toward close.",
              },
            ],
          },
        ],
      },
      createTestExtra(authenticator, pod.sId)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Only workspace admins");
    }
  });

  it("lists work areas for a member batch in one call", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "admin",
    });
    const pod = await createActivationPodForCaller(authenticator, workspace);
    const firstTarget = await UserFactory.basic();
    const secondTarget = await UserFactory.basic();
    await MembershipFactory.associate(workspace, firstTarget, { role: "user" });
    await MembershipFactory.associate(workspace, secondTarget, {
      role: "user",
    });
    const firstTargetPod = await createActivationPodForCaller(
      await Authenticator.fromUserIdAndWorkspaceId(
        firstTarget.sId,
        workspace.sId
      ),
      workspace
    );
    const firstActivationPod = await ActivationPodResource.fetchBySpace(
      authenticator,
      firstTargetPod
    );
    const secondTargetPod = await createActivationPodForCaller(
      await Authenticator.fromUserIdAndWorkspaceId(
        secondTarget.sId,
        workspace.sId
      ),
      workspace
    );
    const secondActivationPod = await ActivationPodResource.fetchBySpace(
      authenticator,
      secondTargetPod
    );
    if (!firstActivationPod || !secondActivationPod) {
      throw new Error("Failed to create activation pods for target users.");
    }
    const createResult = await ActivationWorkAreaResource.makeNewForUsers(
      authenticator,
      {
        assignments: [
          {
            owner: firstTarget,
            activationPodModelId: firstActivationPod.id,
            workAreas: [
              {
                title: "Pipeline management",
                description: "Keep active opportunities moving toward close.",
              },
            ],
          },
          {
            owner: secondTarget,
            activationPodModelId: secondActivationPod.id,
            workAreas: [
              {
                title: "Renewal planning",
                description:
                  "Prepare account renewal strategies and next steps.",
              },
            ],
          },
        ],
      }
    );
    expect(createResult.isOk()).toBe(true);

    const result = await getListWorkAreasTool().handler(
      {
        targetUserIds: [firstTarget.sId, secondTarget.sId],
      },
      createTestExtra(authenticator, pod.sId)
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const [content] = result.value;
      expect(content.type).toBe("text");
      if (content.type === "text") {
        expect(content.text).toContain(`"userId":"${firstTarget.sId}"`);
        expect(content.text).toContain('"title":"Pipeline management"');
        expect(content.text).toContain(`"userId":"${secondTarget.sId}"`);
        expect(content.text).toContain('"title":"Renewal planning"');
      }
    }
  });
});
