import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
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

describe("POST /api/w/:wId (workspace default agent)", () => {
  it("sets workspaceDefaultAgentId for a valid agent when the flag is enabled", async () => {
    const { workspace, auth } = await setup();
    await FeatureFlagFactory.basic(auth, "workspace_default_agent");
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const response = await post(workspace, {
      workspaceDefaultAgentId: agent.sId,
    });

    expect(response.status).toBe(200);

    const updated = await WorkspaceResource.fetchById(workspace.sId);
    expect(updated?.metadata?.workspaceDefaultAgentId).toBe(agent.sId);
  });

  it("clears the default and preserves other metadata when passed null", async () => {
    const { workspace, auth } = await setup();
    await FeatureFlagFactory.basic(auth, "workspace_default_agent");
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    // Seed an unrelated metadata key plus the default agent.
    await post(workspace, { reinforcementCapAwuCredits: 5_000 });
    await post(workspace, { workspaceDefaultAgentId: agent.sId });

    const response = await post(workspace, { workspaceDefaultAgentId: null });
    expect(response.status).toBe(200);

    const updated = await WorkspaceResource.fetchById(workspace.sId);
    expect(updated?.metadata?.workspaceDefaultAgentId).toBeUndefined();
    expect(updated?.metadata?.reinforcementCapAwuCredits).toBe(5_000);
  });

  it("returns 400 for an unknown agent", async () => {
    const { workspace, auth } = await setup();
    await FeatureFlagFactory.basic(auth, "workspace_default_agent");

    const response = await post(workspace, {
      workspaceDefaultAgentId: "non-existent-agent",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 403 when the feature flag is disabled", async () => {
    const { workspace } = await setup();

    const response = await post(workspace, {
      workspaceDefaultAgentId: "some-agent",
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("feature_flag_not_found");
  });

  it("returns 403 for non-admin users", async () => {
    for (const role of ["builder", "user"] as const) {
      const { workspace } = await setup(role);

      const response = await post(workspace, {
        workspaceDefaultAgentId: "some-agent",
      });

      expect(response.status).toBe(403);
      expect((await response.json()).error.type).toBe("workspace_auth_error");
    }
  });
});

describe("POST /api/w/:wId (published agents restricted models)", () => {
  it("sets allowRestrictedModelsForPublishedAgents in workspace metadata", async () => {
    const { workspace } = await setup();

    const response = await post(workspace, {
      allowRestrictedModelsForPublishedAgents: true,
    });

    expect(response.status).toBe(200);

    const updated = await WorkspaceResource.fetchById(workspace.sId);
    expect(updated?.metadata?.allowRestrictedModelsForPublishedAgents).toBe(
      true
    );
  });

  it("disables the override and preserves other metadata", async () => {
    const { workspace } = await setup();

    await post(workspace, { reinforcementCapAwuCredits: 5_000 });
    await post(workspace, { allowRestrictedModelsForPublishedAgents: true });

    const response = await post(workspace, {
      allowRestrictedModelsForPublishedAgents: false,
    });

    expect(response.status).toBe(200);

    const updated = await WorkspaceResource.fetchById(workspace.sId);
    expect(updated?.metadata?.allowRestrictedModelsForPublishedAgents).toBe(
      false
    );
    expect(updated?.metadata?.reinforcementCapAwuCredits).toBe(5_000);
  });

  it("returns 403 for non-admin users", async () => {
    for (const role of ["builder", "user"] as const) {
      const { workspace } = await setup(role);

      const response = await post(workspace, {
        allowRestrictedModelsForPublishedAgents: true,
      });

      expect(response.status).toBe(403);
      expect((await response.json()).error.type).toBe("workspace_auth_error");
    }
  });
});

describe("POST /api/w/:wId (workspace analytics opt-out)", () => {
  it("sets disableWorkspaceAnalytics in workspace metadata", async () => {
    const { workspace } = await setup();

    const response = await post(workspace, {
      disableWorkspaceAnalytics: true,
    });

    expect(response.status).toBe(200);

    const updated = await WorkspaceResource.fetchById(workspace.sId);
    expect(updated?.metadata?.disableWorkspaceAnalytics).toBe(true);
  });

  it("re-enables analytics and preserves other metadata", async () => {
    const { workspace } = await setup();

    await post(workspace, { reinforcementCapAwuCredits: 5_000 });
    await post(workspace, { disableWorkspaceAnalytics: true });

    const response = await post(workspace, {
      disableWorkspaceAnalytics: false,
    });

    expect(response.status).toBe(200);

    const updated = await WorkspaceResource.fetchById(workspace.sId);
    expect(updated?.metadata?.disableWorkspaceAnalytics).toBe(false);
    expect(updated?.metadata?.reinforcementCapAwuCredits).toBe(5_000);
  });

  it("returns 403 for non-admin users", async () => {
    for (const role of ["builder", "user"] as const) {
      const { workspace } = await setup(role);

      const response = await post(workspace, {
        disableWorkspaceAnalytics: true,
      });

      expect(response.status).toBe(403);
      expect((await response.json()).error.type).toBe("workspace_auth_error");
    }
  });
});

describe("POST /api/w/:wId (identity settings permission)", () => {
  it("lets a member with the admin:security permission enforce SSO", async () => {
    const { workspace, user } = await setup("user");

    await grantWorkspacePermission(workspace, user, {
      grantType: "admin",
      resourceType: "security",
    });

    const response = await post(workspace, { ssoEnforced: true });

    expect(response.status).toBe(200);

    const updated = await WorkspaceResource.fetchById(workspace.sId);
    expect(updated?.ssoEnforced).toBe(true);
  });

  it("returns 403 for a member without the admin:security permission", async () => {
    const { workspace } = await setup("user");

    const response = await post(workspace, { ssoEnforced: true });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message:
          "You do not have permission to manage identity and provisioning settings.",
      },
    });
  });

  it("still blocks non-security settings for a member with only the admin:security permission", async () => {
    const { workspace, user } = await setup("user");

    await grantWorkspacePermission(workspace, user, {
      grantType: "admin",
      resourceType: "security",
    });

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
  });

  it("does not let an admin:security holder escalate to an admin-only setting via a mixed body", async () => {
    const { workspace, user } = await setup("user");

    await grantWorkspacePermission(workspace, user, {
      grantType: "admin",
      resourceType: "security",
    });

    // Craft a body mixing an identity setting (`ssoEnforced`) with an admin-only
    // setting (`regionalModelsOnly`). The zod union strips the request down to a
    // single member, so the admin-only field never reaches the handler and cannot
    // be applied by a non-admin.
    const response = await post(workspace, {
      ssoEnforced: true,
      regionalModelsOnly: true,
    });

    expect(response.status).toBe(200);

    const updated = await WorkspaceResource.fetchById(workspace.sId);
    expect(updated?.ssoEnforced).toBe(true);
    expect(updated?.regionalModelsOnly).toBe(false);
  });
});
