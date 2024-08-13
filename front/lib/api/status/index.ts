import { cacheWithRedis, isDevelopment } from "@dust-tt/types";

import config from "@app/lib/api/config";
import { getUnresolvedIncidents } from "@app/lib/api/status/status_page";

async function getProviderStatus() {
  if (isDevelopment()) {
    return null;
  }

  const providerIncidents = await getUnresolvedIncidents({
    apiToken: config.getStatusPageApiToken(),
    pageId: config.getProviderStatusPageId(),
  });

  if (providerIncidents.length === 0) {
    return null;
  }

  const [incident] = providerIncidents;
  const { name, incident_updates: incidentUpdates } = incident;
  const [latestUpdate] = incidentUpdates.reverse();

  return {
    name,
    description: latestUpdate.body,
    link: incident.shortlink,
  };
}

export const getProviderStatusMemoized = cacheWithRedis(
  getProviderStatus,
  () => {
    return "provider-status";
  },
  // Caches data for 2 minutes to limit frequent API calls.
  // Status page rate limit is pretty aggressive.
  2 * 60 * 1000
);
