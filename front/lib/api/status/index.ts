import config from "@app/lib/api/config";
import { getUnresolvedIncidents } from "@app/lib/api/status/status_page";
import { cacheWithRedis } from "@app/lib/utils/cache";
import { isDevelopment } from "@app/types";

interface AppStatusComponent {
  description: string;
  link: string;
  name: string;
}

export interface AppStatus {
  dustStatus: AppStatusComponent | null;
  providersStatus: AppStatusComponent | null;
}

async function getProvidersStatus(): Promise<AppStatusComponent | null> {
  if (isDevelopment()) {
    return null;
  }

  const providersIncidents = await getUnresolvedIncidents({
    apiToken: config.getStatusPageApiToken(),
    pageId: config.getStatusPageProvidersPageId(),
  });

  if (providersIncidents.length > 0) {
    const [incident] = providersIncidents;
    const { name, incident_updates: incidentUpdates } = incident;
    const [latestUpdate] = incidentUpdates;
    return {
      name,
      description: latestUpdate.body,
      link: incident.shortlink,
    };
  }

  return null;
}

async function getDustStatus(): Promise<AppStatusComponent | null> {
  if (isDevelopment()) {
    return null;
  }

  const dustIncidents = await getUnresolvedIncidents({
    apiToken: config.getStatusPageApiToken(),
    pageId: config.getStatusPageDustPageId(),
  });

  if (dustIncidents.length > 0) {
    const [incident] = dustIncidents;
    const { name, incident_updates: incidentUpdates } = incident;
    const [latestUpdate] = incidentUpdates;
    return {
      name,
      description: latestUpdate.body,
      link: incident.shortlink,
    };
  }

  return null;
}

export const getProviderStatusMemoized = cacheWithRedis(
  getProvidersStatus,
  () => {
    return "provider-status";
  },
  // Caches data for 2 minutes to limit frequent API calls.
  // Status page rate limit is pretty aggressive.
  {
    ttlMs: 2 * 60 * 1000,
  }
);

export const getDustStatusMemoized = cacheWithRedis(
  getDustStatus,
  () => {
    return "dust-status";
  },
  // Caches data for 2 minutes to limit frequent API calls.
  // Status page rate limit is pretty aggressive.
  {
    ttlMs: 2 * 60 * 1000,
  }
);
