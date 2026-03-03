import config from "@app/lib/api/config";
import type { RegionType } from "@app/lib/api/regions/config";
import { config as regionConfig } from "@app/lib/api/regions/config";
import type { StatusPageIncidentType } from "@app/lib/api/status/status_page";
import { getUnresolvedIncidents } from "@app/lib/api/status/status_page";
import { cacheWithRedis } from "@app/lib/utils/cache";
import { isDevelopment } from "@app/types/shared/env";

interface AppStatusComponent {
  description: string;
  link: string;
  name: string;
}

export interface AppStatus {
  dustStatus: AppStatusComponent | null;
  providersStatus: AppStatusComponent | null;
}

/**
 * Determines if a StatusPage incident is relevant to a given region.
 * - Incidents with no components are global and shown in all regions.
 * - Incidents with components are shown only if a matching region component is
 *   present.
 */
function isIncidentRelevantToRegion(
  incident: Pick<StatusPageIncidentType, "components">,
  region: RegionType
): boolean {
  if (incident.components.length === 0) {
    return true;
  }

  return incident.components.some((c) => c.name === region);
}

async function getProvidersStatus(): Promise<AppStatusComponent | null> {
  if (isDevelopment()) {
    return null;
  }

  const currentRegion = regionConfig.getCurrentRegion();
  const providersIncidents = await getUnresolvedIncidents({
    apiToken: config.getStatusPageApiToken(),
    pageId: config.getStatusPageProvidersPageId(),
  });

  const relevantIncidents = providersIncidents.filter((incident) =>
    isIncidentRelevantToRegion(incident, currentRegion)
  );

  if (relevantIncidents.length > 0) {
    const [incident] = relevantIncidents;
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

  const currentRegion = regionConfig.getCurrentRegion();
  const dustIncidents = await getUnresolvedIncidents({
    apiToken: config.getStatusPageApiToken(),
    pageId: config.getStatusPageDustPageId(),
  });

  const relevantIncidents = dustIncidents.filter((incident) =>
    isIncidentRelevantToRegion(incident, currentRegion)
  );

  if (relevantIncidents.length > 0) {
    const [incident] = relevantIncidents;
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
    return `provider-status-${regionConfig.getCurrentRegion()}`;
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
    return `dust-status-${regionConfig.getCurrentRegion()}`;
  },
  // Caches data for 2 minutes to limit frequent API calls.
  // Status page rate limit is pretty aggressive.
  {
    ttlMs: 2 * 60 * 1000,
  }
);
