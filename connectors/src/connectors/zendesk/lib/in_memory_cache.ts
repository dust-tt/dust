import type { ZendeskFetchedOrganization } from "@connectors/connectors/zendesk/lib/types";

// In-memory cache for organizations.
const organizationCache = new Map<string, ZendeskFetchedOrganization>();

function makeOrganizationCacheKey({
  brandSubdomain,
  organizationId,
}: {
  brandSubdomain: string;
  organizationId: number;
}) {
  return `zendesk:organization:${brandSubdomain}:${organizationId}`;
}

export function getOrganizationFromCache({
  brandSubdomain,
  organizationId,
}: {
  brandSubdomain: string;
  organizationId: number;
}) {
  return organizationCache.get(
    makeOrganizationCacheKey({ brandSubdomain, organizationId })
  );
}

export function setOrganizationInCache(
  organization: ZendeskFetchedOrganization,
  {
    brandSubdomain,
    organizationId,
  }: {
    brandSubdomain: string;
    organizationId: number;
  }
) {
  return organizationCache.set(
    makeOrganizationCacheKey({ brandSubdomain, organizationId }),
    organization
  );
}

export function clearOrganizationCache() {
  organizationCache.clear();
}
