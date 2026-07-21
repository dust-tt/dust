import { joinActivationPodPlugin } from "@app/lib/api/poke/plugins/spaces/join_activation_pod";
import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
//
// The pod's trigger/webhook wiring is unrelated to the schedule-lifecycle
// behavior under test here, and exercising it for real would require setting
// up webhook sources and firing an actual agent conversation. Mock it so the
// plugin's `execute` can be driven end to end against the real test DB for
// everything else (space/membership/skills creation).

const {
  mockGetOrCreateActivationWebhookSourceView,
  mockCreateActivationTrigger,
  mockEmitActivationEvent,
  mockStartActivationWorkspaceSchedule,
} = vi.hoisted(() => ({
  mockGetOrCreateActivationWebhookSourceView: vi.fn(),
  mockCreateActivationTrigger: vi.fn(),
  mockEmitActivationEvent: vi.fn(),
  mockStartActivationWorkspaceSchedule: vi.fn(),
}));

vi.mock("@app/lib/api/activation/trigger", () => ({
  getOrCreateActivationWebhookSourceView:
    mockGetOrCreateActivationWebhookSourceView,
  createActivationTrigger: mockCreateActivationTrigger,
  emitActivationEvent: mockEmitActivationEvent,
}));

vi.mock("@app/temporal/activation_scheduler/client", () => ({
  startActivationWorkspaceSchedule: mockStartActivationWorkspaceSchedule,
}));

beforeEach(async () => {
  mockGetOrCreateActivationWebhookSourceView.mockReset();
  mockCreateActivationTrigger.mockReset();
  mockEmitActivationEvent.mockReset();
  mockStartActivationWorkspaceSchedule.mockReset();

  mockGetOrCreateActivationWebhookSourceView.mockResolvedValue(
    new Ok({ sId: "wsv_test" })
  );
  // A syntactically valid but non-existent trigger sId: TriggerResource.fetchById
  // (called with this value in the plugin) resolves it to no row, so the pod is
  // created with a null trigger -- fine here since the trigger/webhook wiring is
  // mocked out and not under test.
  mockCreateActivationTrigger.mockResolvedValue(
    new Ok({ triggerId: makeSId("trigger", { id: 1, workspaceId: 1 }) })
  );
  mockEmitActivationEvent.mockResolvedValue(new Ok({ triggerId: null }));
  mockStartActivationWorkspaceSchedule.mockResolvedValue(new Ok(undefined));

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

describe("joinActivationPodPlugin.execute", () => {
  it("starts the workspace's Activation schedule once provisioning succeeds", async () => {
    const { workspace, adminAuth, editor } = await makeWorkspaceWithEditor();

    const result = await joinActivationPodPlugin.execute(adminAuth, null, {
      editorUserId: [editor.sId],
      memberUserIds: [],
      podName: "",
      defaultSkillIds: [],
      agentsMdInstructions: "",
    });

    expect(result.isOk()).toBe(true);
    expect(mockStartActivationWorkspaceSchedule).toHaveBeenCalledWith({
      workspaceId: workspace.sId,
    });
  });

  it("returns Err and does not report success when starting the schedule fails", async () => {
    const { adminAuth, editor } = await makeWorkspaceWithEditor();
    mockStartActivationWorkspaceSchedule.mockResolvedValue(
      new Err(new Error("temporal unavailable"))
    );

    const result = await joinActivationPodPlugin.execute(adminAuth, null, {
      editorUserId: [editor.sId],
      memberUserIds: [],
      podName: "",
      defaultSkillIds: [],
      agentsMdInstructions: "",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("temporal unavailable");
    }
  });
});
