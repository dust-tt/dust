import { listConsumptionFacetCatalog } from "@app/lib/api/analytics/consumption/facet_catalog";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
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
