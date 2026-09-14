import { determineEligibleActivationUsers } from "@app/lib/api/activation/orchestrator";
import { Authenticator } from "@app/lib/auth";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEvaluateActivation } = vi.hoisted(() => ({
  mockEvaluateActivation: vi.fn(),
}));

vi.mock("@app/lib/api/activation/evaluator", () => ({
  evaluateActivation: mockEvaluateActivation,
}));

function notActivated(userIds: string[]) {
  return new Ok(
    new Map(
      userIds.map((userId) => [
        userId,
        {
          activated: false,
          hvucDays: 0,
          hvucWeeks: 0,
          minHvucDays: 6,
          minDistinctWeeks: 3,
          trailingWindowDays: 28,
          evidence: { qualifyingDays: [], qualifyingWeeks: [] },
        },
      ])
    )
  );
}

beforeEach(() => {
  mockEvaluateActivation.mockReset();
  mockEvaluateActivation.mockImplementation(
    async (_auth: unknown, { userIds }: { userIds: string[] }) =>
      notActivated(userIds)
  );
});

async function makeWorkspaceWithPod({ byok = false }: { byok?: boolean } = {}) {
  const workspace = byok
    ? await WorkspaceFactory.byok()
    : await WorkspaceFactory.basic();
  const owner = await UserFactory.basic();
  await MembershipFactory.associate(workspace, owner, { role: "admin" });

  const { globalGroup, systemGroup } = await GroupFactory.defaults(workspace);
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId, {
    dangerouslyRequestAllGroups: true,
  });
  await SpaceResource.makeDefaultsForWorkspace(auth, {
    globalGroup,
    systemGroup,
  });

  const pod = await SpaceFactory.project(workspace, owner.id);
  await ProjectMetadataResource.makeNew(auth, pod, { description: null });
  await ActivationPodResource.makeNew(auth, {
    pod,
    user: owner,
  });

  return { workspace, owner, auth };
}

describe("determineEligibleActivationUsers", () => {
  it("includes the pod owner when they have an active membership", async () => {
    const { owner, auth } = await makeWorkspaceWithPod();

    const result = await determineEligibleActivationUsers(auth);
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.eligible.map((e) => e.targetUserId)).toEqual([
      owner.sId,
    ]);
  });

  it("skips a pod whose owner no longer has an active workspace membership", async () => {
    const { workspace, owner, auth } = await makeWorkspaceWithPod();
    await MembershipResource.revokeMembership({
      user: owner,
      workspace,
      allowLastAdminRevocation: true,
    });

    const result = await determineEligibleActivationUsers(auth);
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.eligible).toEqual([]);
  });

  it("returns no candidates for a BYOK workspace", async () => {
    const { auth } = await makeWorkspaceWithPod({ byok: true });

    const result = await determineEligibleActivationUsers(auth);
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.eligible).toEqual([]);
    expect(mockEvaluateActivation).not.toHaveBeenCalled();
  });

  it("includes the pod owner on a BYOK workspace when overrideChecks is set", async () => {
    const { owner, auth } = await makeWorkspaceWithPod({ byok: true });

    const result = await determineEligibleActivationUsers(auth, {
      overrideChecks: true,
    });
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.eligible.map((e) => e.targetUserId)).toEqual([
      owner.sId,
    ]);
    expect(mockEvaluateActivation).not.toHaveBeenCalled();
  });
});
