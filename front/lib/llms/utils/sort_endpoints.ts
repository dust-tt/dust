import type { Region } from "@app/lib/model_constructors/types/regions";
import sortBy from "lodash/sortBy";

// Orders endpoints so that those matching the preferred region come first,
// preserving the relative order of the remaining endpoints (lodash `sortBy` is
// stable). Callers typically pick the first element as the best match.
export function sortEndpointsByPreferredRegion<T extends { region: Region }>(
  endpoints: T[],
  preferredRegion: Region
): T[] {
  return sortBy(endpoints, (endpoint) => endpoint.region !== preferredRegion);
}
