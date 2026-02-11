import type { Organization } from "@workos-inc/node";
import { DomainDataState, OrganizationDomainState } from "@workos-inc/node";
import uniqueId from "lodash/uniqueId";

import { getWorkOS } from "@app/lib/api/workos/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";

function isWorkOSNotFoundEntityError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "status" in error &&
    error.status === 404 &&
    "code" in error &&
    error.code === "entity_not_found"
  );
}

export async function getWorkOSOrganization(
  workspace: LightWorkspaceType
): Promise<Result<Organization | undefined, Error>> {
  try {
    const result = await getWorkOS().organizations.getOrganizationByExternalId(
      workspace.sId
    );

    return new Ok(result);
  } catch (error) {
    // If the organization is not found, return undefined.
    if (isWorkOSNotFoundEntityError(error)) {
      return new Ok(undefined);
    }

    return new Err(new Error("Failed to get WorkOS organization."));
  }
}
export async function listWorkOSOrganizationsWithDomain(
  domain: string
): Promise<Organization[]> {
  const workOS = getWorkOS();
  const organizations = await workOS.organizations.listOrganizations({
    domains: [domain],
    limit: 100,
  });

  return organizations.data;
}

export async function removeWorkOSOrganizationDomain(
  workspace: LightWorkspaceType,
  { domain }: { domain: string }
): Promise<Result<void, Error>> {
  const organizationRes = await getWorkOSOrganization(workspace);
  if (organizationRes.isErr()) {
    return new Err(organizationRes.error);
  }

  const organization = organizationRes.value;
  if (!organization) {
    return new Err(
      new Error("WorkOS organization not found for this workspace.")
    );
  }

  return removeWorkOSOrganizationDomainFromOrganization(organization, {
    domain,
  });
}

export async function removeWorkOSOrganizationDomainFromOrganization(
  organization: Organization,
  { domain }: { domain: string }
): Promise<Result<void, Error>> {
  await getWorkOS().organizations.updateOrganization({
    organization: organization.id,
    domainData: organization.domains
      .filter(
        (d) =>
          d.domain !== domain && d.state === OrganizationDomainState.Verified
      )
      .map((d) => ({
        domain: d.domain,
        state: DomainDataState.Verified,
      })),
  });

  // WARN: Hacky update done after the domain data, so that it trigger
  // the webhook. Should be remove once WorkOS send us webhook when just
  // the domains change.
  await getWorkOS().organizations.updateOrganization({
    organization: organization.id,
    metadata: {
      _webhookTrigger: uniqueId(),
    },
  });

  return new Ok(undefined);
}
