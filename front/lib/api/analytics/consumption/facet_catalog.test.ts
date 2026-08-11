import { listConsumptionFacetCatalog } from "@app/lib/api/analytics/consumption/facet_catalog";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
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
});
