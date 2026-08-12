import { activationManagementPlugin } from "@app/lib/api/poke/plugins/spaces/activation_management";
import { Authenticator } from "@app/lib/auth";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPostActivationNudge,
  mockListActivationPodsByUser,
  mockStartActivationWorkspaceSchedule,
} = vi.hoisted(() => ({
  mockPostActivationNudge: vi.fn(),
  mockListActivationPodsByUser: vi.fn(),
  mockStartActivationWorkspaceSchedule: vi.fn(),
}));

vi.mock("@app/lib/api/activation/nudge", () => ({
  postActivationNudge: mockPostActivationNudge,
}));

vi.mock("@app/lib/api/activation/pods", () => ({
  listActivationPodsByUser: mockListActivationPodsByUser,
}));

vi.mock("@app/temporal/activation_scheduler/client", () => ({
  startActivationWorkspaceSchedule: mockStartActivationWorkspaceSchedule,
}));

beforeEach(async () => {
  mockPostActivationNudge.mockReset();
  mockListActivationPodsByUser.mockReset();
  mockStartActivationWorkspaceSchedule.mockReset();

  mockPostActivationNudge.mockResolvedValue(new Ok({ conversationId: "conv" }));
  // No user has a pod yet, so every target is provisioned fresh.
  mockListActivationPodsByUser.mockResolvedValue(new Map());
  mockStartActivationWorkspaceSchedule.mockResolvedValue(new Ok(undefined));

  // The canonical ActivationPod row is orthogonal to the schedule lifecycle
  // under test. Stub it out.
  vi.spyOn(ActivationPodResource, "makeNew").mockResolvedValue(
    {} as ActivationPodResource
  );

  // Pod creation kicks off a real (external) dust_project connector; stub it
  // out the same way lib/api/spaces.test.ts does for "project" space tests.
  vi.spyOn(
    await import("@app/lib/api/projects/connector"),
    "createDataSourceAndConnectorForProject"
  ).mockResolvedValue(new Ok(undefined));
});

async function makeWorkspaceWithEditor() {
  const workspace = await WorkspaceFactory.basic();
  const editor = await UserFactory.basic();
  await MembershipFactory.associate(workspace, editor, { role: "admin" });

  // Bootstrap the workspace's default groups/spaces, mirroring what
  // `createWorkspaceInternal` does in production before any pod can be
  // provisioned.
  const { globalGroup, systemGroup } = await GroupFactory.defaults(workspace);
  const adminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  await SpaceResource.makeDefaultsForWorkspace(adminAuth, {
    globalGroup,
    systemGroup,
  });

  return { workspace, adminAuth, editor };
}

describe("activationManagementPlugin.execute", () => {
  it("starts the workspace's Activation schedule once provisioning succeeds", async () => {
    const { workspace, adminAuth, editor } = await makeWorkspaceWithEditor();
    const workAreas =
      "Enterprise account planning — Prepare account plans for strategic customers.";
    const activationPlaybook =
      "Prioritize actions that reduce time spent preparing account plans.";

    const result = await activationManagementPlugin.execute(adminAuth, null, {
      targetUserIds: [editor.sId],
      groupId: [],
      sessionGoal: "",
      pushedResource: [],
      workAreas,
      activationPlaybook,
      podName: "",
      forceRecreate: false,
    });

    expect(result.isOk()).toBe(true);
    expect(mockStartActivationWorkspaceSchedule).toHaveBeenCalledWith({
      workspaceId: workspace.sId,
    });
    expect(mockPostActivationNudge).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        context: expect.objectContaining({ workAreas, activationPlaybook }),
      })
    );

    expect(ActivationPodResource.makeNew).toHaveBeenCalled();
  });

  it("returns Err and does not report success when starting the schedule fails", async () => {
    const { adminAuth, editor } = await makeWorkspaceWithEditor();
    mockStartActivationWorkspaceSchedule.mockResolvedValue(
      new Err(new Error("temporal unavailable"))
    );

    const result = await activationManagementPlugin.execute(adminAuth, null, {
      targetUserIds: [editor.sId],
      groupId: [],
      sessionGoal: "",
      pushedResource: [],
      workAreas: "",
      activationPlaybook: "",
      podName: "",
      forceRecreate: false,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("temporal unavailable");
    }
  });
});
