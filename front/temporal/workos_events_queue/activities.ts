import type { Event, OrganizationDomain } from "@workos-inc/node";
import assert from "assert";

import { getOrCreateWorkOSOrganization } from "@app/lib/api/workos/organization";
import {
  findWorkspaceByWorkOSOrganizationId,
  getWorkspaceInfos,
} from "@app/lib/api/workspace";
import {
  deleteWorkspaceDomain,
  upsertWorkspaceDomain,
} from "@app/lib/api/workspace_domains";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";

async function handleOrganizationDomainEvent(
  eventData: OrganizationDomain,
  expectedState: "verified" | "failed"
) {
  const { domain, organizationId, state } = eventData;

  assert(
    state === expectedState,
    `Domain state is not ${expectedState} -- expected ${expectedState} but got ${state}`
  );

  const workspace = await findWorkspaceByWorkOSOrganizationId(organizationId);
  if (!workspace) {
    logger.info(
      { organizationId },
      "[WorkOS Event] Workspace not found for organization"
    );
    // Skip processing if workspace not found - it likely belongs to another region.
    // This is expected in a multi-region setup. DataDog monitors these warnings
    // and will alert if they occur across all regions.
    return;
  }

  let domainResult: Result<any, Error>;
  if (expectedState === "verified") {
    domainResult = await upsertWorkspaceDomain(workspace, { domain });
  } else {
    domainResult = await deleteWorkspaceDomain(workspace, { domain });
  }

  if (domainResult.isErr()) {
    logger.error(
      { error: domainResult.error },
      "Error updating/deleting domain"
    );
    throw domainResult.error;
  }

  logger.info({ domain }, "Domain updated/deleted");
}

// WorkOS webhooks do not guarantee event ordering. Events can arrive out of sequence.
// We rely on Temporal's retry strategies and the idempotency of these activities
// to correctly process events even if they are received in a non-chronological order.
export async function processWorkOSEventActivity({
  eventPayload,
}: {
  eventPayload: Event;
}) {
  switch (eventPayload.event) {
    case "organization_domain.verified":
      await handleOrganizationDomainVerified(eventPayload.data);
      break;

    case "organization_domain.verification_failed":
      await handleOrganizationDomainVerificationFailed(eventPayload.data);
      break;

    default:
      logger.info(
        { eventType: eventPayload.event },
        "Unhandled workOS event type -- skipping"
      );
      break;
  }
}

async function handleOrganizationDomainVerified(eventData: OrganizationDomain) {
  await handleOrganizationDomainEvent(eventData, "verified");
}

async function handleOrganizationDomainVerificationFailed(
  eventData: OrganizationDomain
) {
  await handleOrganizationDomainEvent(eventData, "failed");
}

export async function handleWorkspaceSubscriptionCreated({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const workspace = await getWorkspaceInfos(workspaceId);
  if (!workspace) {
    logger.info({ workspaceId }, "Workspace not found");
    throw new Error(`Workspace not found for workspace ${workspaceId}`);
  }

  // If workspace already has an organization, skip.
  if (workspace.workOSOrganizationId) {
    logger.info({ workspaceId }, "Workspace already has a WorkOS organization");
    return;
  }

  const organisationRes = await getOrCreateWorkOSOrganization(workspace);
  if (organisationRes.isErr()) {
    logger.error(
      { error: organisationRes.error },
      "Error creating WorkOS organization"
    );
    throw organisationRes.error;
  }
}
