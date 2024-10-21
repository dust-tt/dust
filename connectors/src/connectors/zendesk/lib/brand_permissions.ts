import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  ModelId,
} from "@dust-tt/types";

import { getBrandInternalId } from "@connectors/connectors/zendesk/lib/id_conversions";
import { getZendeskAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import {
  fetchZendeskBrand,
  fetchZendeskBrands,
} from "@connectors/connectors/zendesk/lib/zendesk_api";
import {
  ZendeskArticle,
  ZendeskBrand,
  ZendeskCategory,
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
  brandId: string;
  withChildren?: boolean;
}): Promise<ZendeskBrand> {
  let brand = await ZendeskBrand.findOne({ where: { connectorId, brandId } });

  const accessToken = await getZendeskAccessToken(connectionId);
  if (brand?.permission === "none") {
    await brand.update({
      permission: "read",
    });
  }
  if (!brand) {
    const fetchedBrand = await fetchZendeskBrand({
      subdomain,
      accessToken,
      brandId,
    });
    if (fetchedBrand) {
      brand = await ZendeskBrand.create({
        subdomain: fetchedBrand.subdomain,
        connectorId: connectorId,
        brandId: fetchedBrand.id.toString(),
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

  return brand;
}

export async function retrieveZendeskBrandsPermissions({
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

  const subdomain = "d3v-dust"; // TODO: get subdomain from connector
  const accessToken = await getZendeskAccessToken(connector.connectionId);

  const isReadPermissionsOnly = filterPermission === "read";
  const isRootLevel = !parentInternalId;
  let nodes: ContentNode[] = [];

  // At the root level, we retrieve the list of Brands.
  // If isReadPermissionsOnly = true, we retrieve the list of Brands from the DB that have permission == "read"
  // If isReadPermissionsOnly = false, we retrieve the list of Brands from Zendesk
  if (isRootLevel) {
    if (isReadPermissionsOnly) {
      const brandsInDatabase = await ZendeskBrand.findAll({
        where: { connectorId: connectorId, permission: "read" },
      });
      nodes = brandsInDatabase.map((brand) => ({
        provider: connector.type,
        internalId: getBrandInternalId(connectorId, brand.brandId),
        parentInternalId: null,
        type: "database",
        title: brand.name,
        sourceUrl: null,
        expandable: true,
        permission: brand.permission,
        dustDocumentId: null,
        lastUpdatedAt: brand.updatedAt.getTime(),
      }));
    } else {
      const brands = await fetchZendeskBrands({ subdomain, accessToken });
      nodes = brands.map((brand) => ({
        provider: connector.type,
        internalId: getBrandInternalId(connectorId, brand.id.toString()),
        parentInternalId: null,
        type: "database",
        title: brand.name || "Brand",
        sourceUrl: null,
        expandable: true,
        preventSelection: true,
        permission: "none",
        dustDocumentId: null,
        lastUpdatedAt: null,
      }));
    }
    nodes.sort((a, b) => a.title.localeCompare(b.title));
    return nodes;
  }
  // TODO: handle other types of parent here

  return nodes;
}
