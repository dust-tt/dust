import type { Organization } from "@workos-inc/node";

export interface GetWorkspaceDomainsResponseBody {
  addDomainLink?: string;
  domains: Organization["domains"];
}
