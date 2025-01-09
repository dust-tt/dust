import { makeScript } from "scripts/helpers";

import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import { fetchZendeskBrand } from "@connectors/connectors/zendesk/lib/zendesk_api";
import type Logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { ZendeskBrandResource } from "@connectors/resources/zendesk_resources";

async function backfillConnector(
  connector: ConnectorResource,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("CHECK");

  const { subdomain, accessToken } = await getZendeskSubdomainAndAccessToken(
    connector.connectionId
  );

  const brands = await ZendeskBrandResource.fetchByConnector(connector);
  for (const brand of brands) {
    const { brandId } = brand;

    const fetchedBrand = await fetchZendeskBrand({
      subdomain,
      accessToken,
      brandId,
    });

    if (!fetchedBrand) {
      logger.warn({ brandId }, "Brand could not be fetched.");
      continue;
    }

    const helpCenterState = fetchedBrand.help_center_state;
    const hasHelpCenter = fetchedBrand.help_center_state;

    if (execute) {
      logger.info({ brandId, hasHelpCenter, helpCenterState }, "LIVE");
      await brand.update({ helpCenterState });
    } else {
      logger.info({ brandId, hasHelpCenter, helpCenterState }, "DRY");
    }
  }
}
makeScript({}, async ({ execute }, logger) => {
  const connectors = await ConnectorResource.listByType("zendesk", {});

  for (const connector of connectors) {
    await backfillConnector(
      connector,
      execute,
      logger.child({ connectorId: connector })
    );
  }
});
