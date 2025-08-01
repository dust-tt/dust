import type { ZendeskFetchedOrganization } from "@connectors/connectors/zendesk/lib/types";

// Nested Map structure: brandSubdomain -> organizationId -> organization
const organizationCache = new Map<
  string,
  Map<number, ZendeskFetchedOrganization>
>();

export function getOrganizationFromCache({
  brandSubdomain,
  organizationId,
}: {
  brandSubdomain: string;
  organizationId: number;
}): ZendeskFetchedOrganization | undefined {
  const brandCache = organizationCache.get(brandSubdomain);
  return brandCache?.get(organizationId);
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
): void {
  let brandCache = organizationCache.get(brandSubdomain);
  if (!brandCache) {
    brandCache = new Map<number, ZendeskFetchedOrganization>();
    organizationCache.set(brandSubdomain, brandCache);
  }
  brandCache.set(organizationId, organization);
}

export function clearOrganizationCache({
  brandSubdomain,
}: {
  brandSubdomain: string;
}): void {
  organizationCache.delete(brandSubdomain);
}
