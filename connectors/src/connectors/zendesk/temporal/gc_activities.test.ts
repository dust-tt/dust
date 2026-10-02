import {
  getArticleInternalId,
  getCategoryInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import { deleteCategoryBatchActivity } from "@connectors/connectors/zendesk/temporal/gc_activities";
import {
  deleteDataSourceDocument,
  deleteDataSourceFolder,
} from "@connectors/lib/data_sources";
import {
  ZendeskArticleModel,
  ZendeskBrandModel,
  ZendeskCategoryModel,
} from "@connectors/lib/models/zendesk";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { describe, expect, it, vi } from "vitest";

vi.mock("@connectors/lib/data_sources", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@connectors/lib/data_sources")>();

  return {
    ...mod,
    deleteDataSourceDocument: vi.fn(),
    deleteDataSourceFolder: vi.fn(),
  };
});

const BRAND_ID = 100;
const SELECTED_CATEGORY_ID = 1;
const UNSELECTED_CATEGORY_ID = 2;
const SELECTED_ARTICLE_ID = 10;
const UNSELECTED_ARTICLE_ID = 20;

async function makeZendeskConnector() {
  return ConnectorResource.makeNew(
    "zendesk",
    {
      connectionId: "zendesk-conn",
      workspaceAPIKey: "key",
      workspaceId: "workspace",
      dataSourceId: "ds",
    },
    {
      subdomain: "acme",
      retentionPeriodDays: 180,
      syncUnresolvedTickets: false,
      hideCustomerDetails: false,
      organizationTagsToInclude: null,
      organizationTagsToExclude: null,
      ticketTagsToInclude: null,
      ticketTagsToExclude: null,
      customFieldsConfig: [],
      rateLimitTransactionsPerSecond: null,
    }
  );
}

// A brand whose Help Center is not selected, with one category explicitly selected by the user
// and one category left over from a previously selected Help Center.
async function seedBrandWithUnselectedHelpCenter(connectorId: ModelId) {
  await ZendeskBrandModel.create({
    connectorId,
    brandId: BRAND_ID,
    name: "Brand",
    url: "https://acme.zendesk.com",
    subdomain: "acme",
    helpCenterPermission: "none",
    ticketsPermission: "none",
  });

  await ZendeskCategoryModel.bulkCreate([
    {
      connectorId,
      brandId: BRAND_ID,
      categoryId: SELECTED_CATEGORY_ID,
      name: "Selected",
      url: "https://acme.zendesk.com/c/1",
      permission: "read",
    },
    {
      connectorId,
      brandId: BRAND_ID,
      categoryId: UNSELECTED_CATEGORY_ID,
      name: "Unselected",
      url: "https://acme.zendesk.com/c/2",
      permission: "none",
    },
  ]);

  await ZendeskArticleModel.bulkCreate([
    {
      connectorId,
      brandId: BRAND_ID,
      categoryId: SELECTED_CATEGORY_ID,
      articleId: SELECTED_ARTICLE_ID,
      name: "Selected article",
      url: "https://acme.zendesk.com/a/10",
      permission: "read",
    },
    {
      connectorId,
      brandId: BRAND_ID,
      categoryId: UNSELECTED_CATEGORY_ID,
      articleId: UNSELECTED_ARTICLE_ID,
      name: "Unselected article",
      url: "https://acme.zendesk.com/a/20",
      permission: "read",
    },
  ]);
}

describe("deleteCategoryBatchActivity", () => {
  it("deletes unselected categories and keeps the selected ones", async () => {
    const connector = await makeZendeskConnector();
    const connectorId = connector.id;
    await seedBrandWithUnselectedHelpCenter(connectorId);

    const { hasMore } = await deleteCategoryBatchActivity({
      connectorId,
      brandId: BRAND_ID,
    });
    expect(hasMore).toBe(false);

    const categories = await ZendeskCategoryModel.findAll({
      where: { connectorId, brandId: BRAND_ID },
    });
    expect(categories.map((c) => c.categoryId)).toEqual([SELECTED_CATEGORY_ID]);

    const articles = await ZendeskArticleModel.findAll({
      where: { connectorId, brandId: BRAND_ID },
    });
    expect(articles.map((a) => a.articleId)).toEqual([SELECTED_ARTICLE_ID]);

    expect(vi.mocked(deleteDataSourceFolder)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deleteDataSourceFolder)).toHaveBeenCalledWith(
      expect.objectContaining({
        folderId: getCategoryInternalId({
          connectorId,
          brandId: BRAND_ID,
          categoryId: UNSELECTED_CATEGORY_ID,
        }),
      })
    );

    expect(vi.mocked(deleteDataSourceDocument)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deleteDataSourceDocument)).toHaveBeenCalledWith(
      expect.anything(),
      getArticleInternalId({
        connectorId,
        brandId: BRAND_ID,
        articleId: UNSELECTED_ARTICLE_ID,
      })
    );
  });
});
