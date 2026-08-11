import { listConsumptionFacetCatalog } from "@app/lib/api/analytics/consumption/facet_catalog";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { describe, expect, it } from "vitest";

describe("listConsumptionFacetCatalog", () => {
  it("includes active workspace members before they generate consumption", async () => {
    const { authenticator, user } = await createResourceTest({
      role: "manager",
    });

    const catalog = await listConsumptionFacetCatalog(authenticator);

    expect(catalog.user).toContainEqual({
      value: user.sId,
      label: user.fullName(),
      pictureUrl: user.imageUrl,
    });
  });

  it("keys remote tools by their indexed effective name, not their server sId", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "manager",
    });
    const workspace = authenticator.getNonNullableWorkspace();
    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "CRM tools",
    });
    await MCPServerViewFactory.create(workspace, server.sId, globalSpace);

    const catalog = await listConsumptionFacetCatalog(authenticator);

    expect(
      catalog.tool.filter((facet) => facet.value === "CRM tools")
    ).toHaveLength(1);
    expect(catalog.tool).toContainEqual(
      expect.objectContaining({
        value: "CRM tools",
        icon: server.icon,
      })
    );
    expect(catalog.tool).not.toContainEqual(
      expect.objectContaining({ value: server.sId })
    );
  });

  it("lists private agents of other users for admins", async () => {
    const { workspace, authenticator: editorAuth } = await createResourceTest({
      role: "user",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(editorAuth, {
      name: "Secret agent",
      scope: "hidden",
    });
    const adminUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, adminUser, { role: "admin" });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );

    const catalog = await listConsumptionFacetCatalog(adminAuth);

    expect(catalog.agent).toContainEqual(
      expect.objectContaining({ value: agent.sId, label: "Secret agent" })
    );
  });

  it("hides private agents of other users below the admin role", async () => {
    const { workspace, authenticator: editorAuth } = await createResourceTest({
      role: "user",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(editorAuth, {
      name: "Secret agent",
      scope: "hidden",
    });
    const managerUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, managerUser, {
      role: "manager",
    });
    const managerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      managerUser.sId,
      workspace.sId
    );

    const catalog = await listConsumptionFacetCatalog(managerAuth);

    expect(catalog.agent).not.toContainEqual(
      expect.objectContaining({ value: agent.sId })
    );
  });

  it("includes the stored skill icon", async () => {
    const { authenticator } = await createResourceTest({ role: "manager" });
    const skill = await SkillFactory.create(authenticator, {
      name: "Writing helper",
    });

    const catalog = await listConsumptionFacetCatalog(authenticator);

    expect(catalog.skill).toContainEqual(
      expect.objectContaining({
        value: skill.sId,
        icon: skill.icon,
      })
    );
  });
});
