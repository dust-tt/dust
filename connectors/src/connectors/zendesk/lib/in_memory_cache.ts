import type { ZendeskOrganization } from "@connectors/connectors/zendesk/lib/types";

// Nested Map structure: brandSubdomain -> organizationId -> organization
const organizationCache = new Map<string, Map<number, ZendeskOrganization>>();

export function getOrganizationFromCache({
  brandSubdomain,
  organizationId,
}: {
  brandSubdomain: string;
  organizationId: number;
}): ZendeskOrganization | undefined {
  const brandCache = organizationCache.get(brandSubdomain);
  return brandCache?.get(organizationId);
}

export function setOrganizationInCache(
  organization: ZendeskOrganization,
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
    brandCache = new Map<number, ZendeskOrganization>();
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
