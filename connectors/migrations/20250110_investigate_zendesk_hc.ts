import { makeScript } from "scripts/helpers";

import { isZendeskNotFoundError } from "@connectors/connectors/zendesk/lib/errors";
import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import {
  fetchZendeskBrand,
  fetchZendeskCategoriesInBrand,
  fetchZendeskCurrentUser,
  getZendeskBrandSubdomain,
} from "@connectors/connectors/zendesk/lib/zendesk_api";
import { ZENDESK_BATCH_SIZE } from "@connectors/connectors/zendesk/temporal/config";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { ZendeskBrandResource } from "@connectors/resources/zendesk_resources";

makeScript({}, async ({ execute }, logger) => {
  const connectors = await ConnectorResource.listByType("zendesk", {});

  for (const connector of connectors) {
    const connectorId = connector.id;
    if (connector.isPaused()) {
      continue;
    }
    const { accessToken, subdomain } = await getZendeskSubdomainAndAccessToken(
      connector.connectionId
    );
    const user = await fetchZendeskCurrentUser({ accessToken, subdomain });
    const brandsOnDb = await ZendeskBrandResource.fetchByConnector(connector);
    for (const brandOnDb of brandsOnDb) {
      const { brandId } = brandOnDb;
      if (!execute) {
        logger.info({ brandId }, "DRY: Fetching brand");
        continue;
      }

      const fetchedBrand = await fetchZendeskBrand({
        brandId,
        accessToken,
        subdomain,
      });
      const brandSubdomain = await getZendeskBrandSubdomain({
        brandId,
        connectorId,
        accessToken,
        subdomain,
      });
      if (!brandSubdomain) {
        throw new Error("Brand not found.");
      }

      let couldFetchCategories;
      try {
        await fetchZendeskCategoriesInBrand(accessToken, {
          brandSubdomain,
          pageSize: ZENDESK_BATCH_SIZE,
        });
        couldFetchCategories = true;
      } catch (e) {
        if (isZendeskNotFoundError(e)) {
          couldFetchCategories = false;
          // if (fetchedBrand?.has_help_center) {
          //   const url = `https://${brandSubdomain}.zendesk.com/api/v2/help_center/articles.json`;
          //   const res = await fetch(url, {
          //     method: "GET",
          //     headers: {
          //       Authorization: `Bearer ${accessToken}`,
          //       "Content-Type": "application/json",
          //     },
          //   });
          //   const text = await res.text();
          //   logger.error(
          //     {
          //       res,
          //       brandSubdomain,
          //       status: res.status,
          //       statusText: res.statusText,
          //       headers: res.headers,
          //       text,
          //       body: res.body,
          //     },
          //     "Failed to fetch categories"
          //   );
          //   await res.json();
          // }
        } else {
          throw e;
        }
      }
      logger.info(
        {
          connectorId,
          brandId,
          couldFetchCategories,
          brandSubdomain,
          hasHelpCenter: fetchedBrand?.has_help_center,
          helpCenterState: fetchedBrand?.help_center_state,
          userRole: user.role,
          userActive: user.active,
        },
        `FETCH`
      );
    }
  }
});
