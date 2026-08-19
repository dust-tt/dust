import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { Authenticator } from "@app/lib/auth";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { ActivationWorkAreaResource } from "@app/lib/resources/activation_work_area_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import assert from "assert";
import { describe, expect, it } from "vitest";

import { TOOLS } from ".";

const WORK_AREA = {
  title: "Pipeline management",
  description: "Keep active opportunities moving toward close.",
};

function getTool(
  name:
    | "create_work_areas"
    | "list_work_areas"
    | "list_activation_pods"
    | "update_work_area"
) {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  assert(tool);
  return tool;
}

function createTestExtra(auth: Authenticator): ToolHandlerExtra {
  return {
    auth,
    requestId: "activation-work-area-test",
    // These focused handlers do not read the run context.
    // @ts-expect-error A registered MCP handler always receives one in production.
    runContext: undefined,
    sendNotification: async () => {},
    sendRequest: async () => {
      throw new Error("Unexpected MCP request");
    },
    signal: new AbortController().signal,
  };
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

async function createUserActivationPod(
  workspace: ReturnType<Authenticator["getNonNullableWorkspace"]>
) {
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "user" });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  const pod = await createActivationPod(auth, workspace);
  return { auth, pod };
}

function getText(result: ToolHandlerResult): string {
  assert(result.isOk());
  const [content] = result.value;
  assert(content?.type === "text");
  return content.text;
}

describe("activation recommendations work-area tools", () => {
  it("lets an editor manage their pod but not another user's pod", async () => {
    const { workspace, authenticator: auth } = await createResourceTest({
      role: "user",
    });
    const ownPod = await createActivationPod(auth, workspace);
    const { pod: otherPod } = await createUserActivationPod(workspace);
    const extra = createTestExtra(auth);

    const listedPods = JSON.parse(
      getText(await getTool("list_activation_pods").handler({}, extra))
    );
    expect(listedPods).toEqual([{ podId: ownPod.sId, name: ownPod.name }]);

    const createResult = await getTool("create_work_areas").handler(
      {
        assignments: [{ podIds: [ownPod.sId], workAreas: [WORK_AREA] }],
      },
      extra
    );
    expect(getText(createResult)).toBe("Saved 1 work areas across 1 pod(s).");

    const listedWorkAreas = JSON.parse(
      getText(
        await getTool("list_work_areas").handler(
          { podIds: [ownPod.sId] },
          extra
        )
      )
    );
    expect(listedWorkAreas).toEqual([
      expect.objectContaining({
        podId: ownPod.sId,
        workAreas: [expect.objectContaining(WORK_AREA)],
      }),
    ]);

    const unauthorized = await getTool("create_work_areas").handler(
      {
        assignments: [{ podIds: [otherPod.sId], workAreas: [WORK_AREA] }],
      },
      extra
    );
    assert(unauthorized.isErr());
    expect(unauthorized.error.message).toContain(
      "Not authorized to manage work areas"
    );
  });

  it("lets a workspace admin manage multiple members' pods", async () => {
    const { workspace, authenticator: auth } = await createResourceTest({
      role: "admin",
    });
    const [{ pod: firstPod }, { pod: secondPod }] = await Promise.all([
      createUserActivationPod(workspace),
      createUserActivationPod(workspace),
    ]);
    const extra = createTestExtra(auth);

    const listedPods = JSON.parse(
      getText(await getTool("list_activation_pods").handler({}, extra))
    );
    expect(listedPods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ podId: firstPod.sId }),
        expect.objectContaining({ podId: secondPod.sId }),
      ])
    );

    const createResult = await getTool("create_work_areas").handler(
      {
        assignments: [
          {
            podIds: [firstPod.sId, secondPod.sId],
            workAreas: [WORK_AREA],
          },
        ],
      },
      extra
    );
    expect(getText(createResult)).toBe("Saved 2 work areas across 2 pod(s).");

    const listedWorkAreas = JSON.parse(
      getText(
        await getTool("list_work_areas").handler(
          { podIds: [firstPod.sId, secondPod.sId] },
          extra
        )
      )
    );
    expect(listedWorkAreas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          podId: firstPod.sId,
          workAreas: [expect.objectContaining(WORK_AREA)],
        }),
        expect.objectContaining({
          podId: secondPod.sId,
          workAreas: [expect.objectContaining(WORK_AREA)],
        }),
      ])
    );
  });

  it("rejects a pod appearing in multiple assignments", async () => {
    const { workspace, authenticator: auth } = await createResourceTest({
      role: "user",
    });
    const pod = await createActivationPod(auth, workspace);

    const result = await getTool("create_work_areas").handler(
      {
        assignments: [
          { podIds: [pod.sId], workAreas: [WORK_AREA] },
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
      createTestExtra(auth)
    );

    assert(result.isErr());
    expect(result.error.message).toContain("Each pod may appear in only one");
  });

  it("returns the same not-found error for missing and unauthorized updates", async () => {
    const { workspace, authenticator: auth } = await createResourceTest({
      role: "user",
    });
    const { auth: targetAuth, pod: targetPod } =
      await createUserActivationPod(workspace);
    const targetActivationPod = await ActivationPodResource.fetchBySpace(
      targetAuth,
      targetPod
    );
    assert(targetActivationPod);

    const workArea = await ActivationWorkAreaResource.makeNew(targetAuth, {
      ...WORK_AREA,
      podId: targetActivationPod.id,
    });
    const extra = createTestExtra(auth);

    const missing = await getTool("update_work_area").handler(
      { workAreaId: "awa_does_not_exist", status: "dismissed" },
      extra
    );
    const unauthorized = await getTool("update_work_area").handler(
      { workAreaId: workArea.sId, status: "dismissed" },
      extra
    );

    assert(missing.isErr());
    assert(unauthorized.isErr());
    expect(missing.error.message).toBe("Work area not found.");
    expect(unauthorized.error.message).toBe(missing.error.message);
  });
});
