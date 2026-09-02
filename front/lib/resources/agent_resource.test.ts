import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { beforeEach, describe, expect, it } from "vitest";

const AGENT_MODEL_ID = 42;

describe("AgentResource", () => {
  let testContext: Awaited<ReturnType<typeof createResourceTest>>;

  beforeEach(async () => {
    testContext = await createResourceTest({ role: "user" });
  });

  it("applies author, admin, and editor permissions to custom agents", async () => {
    const resource = AgentResource.fromAgentConfiguration({
      agentId: AGENT_MODEL_ID,
      authorId: testContext.user.id,
      sId: "custom-agent",
      scope: "hidden",
      workspaceId: testContext.workspace.id,
    });

    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, otherUser, {
      role: "user",
    });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      testContext.workspace.sId
    );

    const admin = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, admin, {
      role: "admin",
    });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      admin.sId,
      testContext.workspace.sId
    );

    expect(resource.id).toBe(AGENT_MODEL_ID);
    expect([
      testContext.authenticator.hasPermission("read", resource),
      testContext.authenticator.hasPermission("write", resource),
      testContext.authenticator.hasPermission("admin", resource),
    ]).toEqual([true, true, true]);
    expect([
      otherAuth.hasPermission("read", resource),
      otherAuth.hasPermission("write", resource),
      otherAuth.hasPermission("admin", resource),
    ]).toEqual([false, false, false]);
    expect([
      adminAuth.hasPermission("read", resource),
      adminAuth.hasPermission("write", resource),
      adminAuth.hasPermission("admin", resource),
    ]).toEqual([true, false, true]);

    const grantResult = await GroupPermissionResource.grantToUser(
      testContext.authenticator,
      {
        user: otherUser.toJSON(),
        grantType: "editor",
        resourceType: "agent",
        resourceId: AGENT_MODEL_ID,
      }
    );
    expect(grantResult.isOk()).toBe(true);
    await otherAuth.refresh();

    expect([
      otherAuth.hasPermission("read", resource),
      otherAuth.hasPermission("write", resource),
      otherAuth.hasPermission("admin", resource),
    ]).toEqual([true, true, true]);
  });

  it("lets workspace members read visible agents without editing them", async () => {
    const resource = AgentResource.fromAgentConfiguration({
      agentId: AGENT_MODEL_ID,
      authorId: testContext.user.id,
      sId: "custom-agent",
      scope: "visible",
      workspaceId: testContext.workspace.id,
    });

    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, otherUser, {
      role: "user",
    });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      testContext.workspace.sId
    );

    expect(otherAuth.hasPermission("read", resource)).toBe(true);
    expect(otherAuth.hasPermission("write", resource)).toBe(false);
    expect(otherAuth.hasPermission("admin", resource)).toBe(false);
  });

  it("keeps code-defined global agents read-only and audience-scoped", async () => {
    const helper = AgentResource.fromGlobalAgent({
      agentId: GLOBAL_AGENTS_SID.HELPER,
      workspaceModelId: testContext.workspace.id,
    });
    const analyst = AgentResource.fromGlobalAgent({
      agentId: GLOBAL_AGENTS_SID.ANALYST,
      workspaceModelId: testContext.workspace.id,
    });

    const manager = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, manager, {
      role: "manager",
    });
    const managerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      manager.sId,
      testContext.workspace.sId
    );

    expect(testContext.authenticator.hasPermission("read", helper)).toBe(true);
    expect(testContext.authenticator.hasPermission("write", helper)).toBe(
      false
    );
    expect(testContext.authenticator.hasPermission("admin", helper)).toBe(
      false
    );
    expect(testContext.authenticator.hasPermission("read", analyst)).toBe(
      false
    );
    expect(managerAuth.hasPermission("read", analyst)).toBe(true);
    expect(managerAuth.hasPermission("write", analyst)).toBe(false);
    expect(managerAuth.hasPermission("admin", analyst)).toBe(false);
  });
});
