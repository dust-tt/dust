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

  it("uses the stable id for custom-agent editor permissions", async () => {
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
      resource.canRead(testContext.authenticator),
      resource.canWrite(testContext.authenticator),
      resource.canAdministrate(testContext.authenticator),
    ]).toEqual([true, true, true]);
    expect([
      resource.canRead(otherAuth),
      resource.canWrite(otherAuth),
      resource.canAdministrate(otherAuth),
    ]).toEqual([false, false, false]);
    expect([
      resource.canRead(adminAuth),
      resource.canWrite(adminAuth),
      resource.canAdministrate(adminAuth),
    ]).toEqual([true, true, true]);

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
      resource.canRead(otherAuth),
      resource.canWrite(otherAuth),
      resource.canAdministrate(otherAuth),
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

    expect(resource.canRead(otherAuth)).toBe(true);
    expect(resource.canWrite(otherAuth)).toBe(false);
    expect(resource.canAdministrate(otherAuth)).toBe(false);
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

    expect(helper.canRead(testContext.authenticator)).toBe(true);
    expect(helper.canWrite(testContext.authenticator)).toBe(false);
    expect(helper.canAdministrate(testContext.authenticator)).toBe(false);
    expect(analyst.canRead(testContext.authenticator)).toBe(false);
    expect(analyst.canRead(managerAuth)).toBe(true);
    expect(analyst.canWrite(managerAuth)).toBe(false);
    expect(analyst.canAdministrate(managerAuth)).toBe(false);
  });
});
