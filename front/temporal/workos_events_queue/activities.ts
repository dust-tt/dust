import type { Event, OrganizationDomain } from "@workos-inc/node";
import assert from "assert";

import { findWorkspaceByWorkOSOrganizationId } from "@app/lib/api/workspace";
import {
  deleteWorkspaceDomain,
  updateWorkspaceDomain,
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
    logger.info({ organizationId }, "Workspace not found for organization");
    throw new Error(`Workspace not found for organization ${organizationId}`);
  }

  let domainResult: Result<any, Error>;
  if (expectedState === "verified") {
    domainResult = await updateWorkspaceDomain(workspace, { domain });
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
