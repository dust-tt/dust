import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  ModelId,
} from "@dust-tt/types";

import { getBrandInternalId } from "@connectors/connectors/zendesk/lib/id_conversions";
import { getZendeskAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import { createZendeskClient } from "@connectors/connectors/zendesk/lib/zendesk_api";
import {
  ZendeskArticle,
  ZendeskBrand,
  ZendeskCategory,
  ZendeskTicket,
} from "@connectors/lib/models/zendesk";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

/**
 * Mark a brand as permission "read" and all children (help center and tickets) if specified.
 */
export async function allowSyncBrand({
  subdomain,
  connectorId,
  connectionId,
  brandId,
  withChildren = false,
}: {
  subdomain: string;
  connectorId: ModelId;
  connectionId: string;
  brandId: number;
  withChildren?: boolean;
}): Promise<ZendeskBrand> {
  let brand = await ZendeskBrand.findOne({ where: { connectorId, brandId } });
  if (brand?.permission === "none") {
    await brand.update({ permission: "read" });
  }

  const token = await getZendeskAccessToken(connectionId);
  const zendeskApiClient = createZendeskClient({ token, subdomain });

  if (!brand) {
    const {
      result: { brand: fetchedBrand },
    } = await zendeskApiClient.brand.show(brandId);
    if (fetchedBrand) {
      brand = await ZendeskBrand.create({
        subdomain: fetchedBrand.subdomain,
        connectorId: connectorId,
        brandId: fetchedBrand.id,
        name: fetchedBrand.name || "Brand",
        permission: "read",
        hasHelpCenter: fetchedBrand.has_help_center,
        url: fetchedBrand.url,
      });
    } else {
      logger.error({ brandId }, "[Zendesk] Brand could not be fetched.");
      throw new Error("Brand could not be fetched.");
    }
  }

  if (withChildren) {
    throw new Error("withChildren not implemented yet.");
  }

  return brand;
}

/**
 * Mark a help center as permission "none" and all children (collections & articles).
 */
export async function revokeSyncBrand({
  connectorId,
  brandId,
}: {
  connectorId: ModelId;
  brandId: string;
}): Promise<ZendeskBrand | null> {
  const brand = await ZendeskBrand.findOne({ where: { connectorId, brandId } });

  // revoking permissions for the brand, the categories and the articles
  if (brand?.permission === "read") {
    await brand.update({ permission: "none" });
  }
  await ZendeskCategory.update(
    { permission: "none" },
    { where: { brandId: brandId } }
  );
  await ZendeskArticle.update(
    { permission: "none" },
    { where: { brandId: brandId } }
  );
  await ZendeskTicket.update(
    { permission: "none" },
    { where: { brandId: brandId } }
  );

  return brand;
}

export async function retrieveZendeskBrandPermissions({
  connectorId,
  parentInternalId,
  filterPermission,
}: {
  connectorId: ModelId;
  parentInternalId: string | null;
  filterPermission: ConnectorPermission | null;
  viewType: ContentNodesViewType;
}): Promise<ContentNode[]> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    logger.error({ connectorId }, "[Zendesk] Connector not found.");
    throw new Error("Connector not found");
  }

  const isReadPermissionsOnly = filterPermission === "read";
  const isRootLevel = !parentInternalId;
  let nodes: ContentNode[] = [];

  // At the root level, we show one node for each brand that has a help center.
  if (isRootLevel) {
    if (isReadPermissionsOnly) {
      const brandsInDatabase = await ZendeskBrand.findAll({
        where: {
          connectorId: connectorId,
          permission: "read",
          hasHelpCenter: true,
        },
      });
      nodes = brandsInDatabase
        .filter((brand) => brand.hasHelpCenter)
        .map((brand) => ({
          provider: connector.type,
          internalId: getBrandInternalId(connectorId, brand.brandId),
          parentInternalId: null,
          type: "folder",
          title: brand.name,
          sourceUrl: brand.url,
          expandable: true,
          permission: brand.permission,
          dustDocumentId: null,
          lastUpdatedAt: brand.updatedAt.getTime(),
        }));
    } else {
      const token = await getZendeskAccessToken(connector.connectionId);
      const zendeskApiClient = createZendeskClient({ token });

      const { result: brands } = await zendeskApiClient.brand.list();
      nodes = brands
        .filter((brand) => brand.has_help_center)
        .map((brand) => ({
          provider: connector.type,
          internalId: getBrandInternalId(connectorId, brand.id),
          parentInternalId: null,
          type: "folder",
          title: brand.name || "Brand",
          sourceUrl: brand.brand_url,
          expandable: true,
          permission: "none",
          dustDocumentId: null,
          lastUpdatedAt: null,
        }));
    }
  }
  nodes.sort((a, b) => a.title.localeCompare(b.title));
  return nodes;
}
