import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { ENSURE_IS_ADMIN_ERROR_MESSAGE } from "@front-api/middlewares/ensure_role";
import { describe, expect, it } from "vitest";

async function setup(role: MembershipRoleType = "admin") {
  return createPrivateApiMockRequest({ method: "POST", role });
}

function post(workspace: { sId: string }, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId (reinforcement caps)", () => {
  it("updates reinforcementCapAwuCredits in workspace metadata", async () => {
    const { workspace } = await setup();

    const response = await post(workspace, {
      reinforcementCapAwuCredits: 5_000,
    });

    expect(response.status).toBe(200);

    const updated = await WorkspaceResource.fetchById(workspace.sId);
    expect(updated?.metadata?.reinforcementCapAwuCredits).toBe(5_000);
  });

  it("updates selfImprovementCapPerSkillAwuCredits and preserves other metadata", async () => {
    const { workspace } = await setup();

    // Set the microUSD cap first; the AWU credits cap must not clobber it.
    const microResponse = await post(workspace, {
      selfImprovementCapPerSkillMicroUsd: 10_000_000,
    });
    expect(microResponse.status).toBe(200);

    const response = await post(workspace, {
      selfImprovementCapPerSkillAwuCredits: 1_500,
    });

    expect(response.status).toBe(200);

    const updated = await WorkspaceResource.fetchById(workspace.sId);
    expect(updated?.metadata?.selfImprovementCapPerSkillAwuCredits).toBe(1_500);
    expect(updated?.metadata?.selfImprovementCapPerSkillMicroUsd).toBe(
      10_000_000
    );
  });

  it("returns 403 for non-admin users", async () => {
    for (const role of ["builder", "user"] as const) {
      const { workspace } = await setup(role);

      const response = await post(workspace, {
        reinforcementCapAwuCredits: 5_000,
      });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: {
          type: "workspace_auth_error",
          message: ENSURE_IS_ADMIN_ERROR_MESSAGE,
        },
      });
    }
  });
});
