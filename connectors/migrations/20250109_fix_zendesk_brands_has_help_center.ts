import { makeScript } from "scripts/helpers";

import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import {
  fetchZendeskBrand,
  isBrandHelpCenterEnabled,
} from "@connectors/connectors/zendesk/lib/zendesk_api";
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

    const oldHasHelpCenter = brand.hasHelpCenter;
    const newHasHelpCenter = isBrandHelpCenterEnabled(fetchedBrand);

    if (execute) {
      logger.info({ brandId, oldHasHelpCenter, newHasHelpCenter }, "LIVE");
      await brand.update({ hasHelpCenter: newHasHelpCenter });
    } else {
      logger.info({ brandId, oldHasHelpCenter, newHasHelpCenter }, "DRY");
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
