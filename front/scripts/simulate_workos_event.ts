import type { Event } from "@workos-inc/node";

import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { makeScript } from "@app/scripts/helpers";
import { launchWorkOSEventsWorkflow } from "@app/temporal/workos_events_queue/client";

/**
 * Script to simulate any WorkOS event
 *
 * Usage:
 *
 * # Group events
 * npx tsx ./scripts/simulate_workos_event.ts \
 *   --workspace-id <workspace-sId> \
 *   --event-type group.created \
 *   --group-name "Project Alpha Team" \
 *   --execute
 *
 * # User events
 * npx tsx ./scripts/simulate_workos_event.ts \
 *   --workspace-id <workspace-sId> \
 *   --event-type user.created \
 *   --user-email "john@example.com" \
 *   --user-first-name "John" \
 *   --user-last-name "Doe" \
 *   --execute
 *
 * # Group membership events (can use -u for user-email)
 * npx tsx ./scripts/simulate_workos_event.ts \
 *   --workspace-id <workspace-sId> \
 *   --event-type group.user_added \
 *   --group-name "Project Alpha Team" \
 *   --user-email "john@example.com" \
 *   --execute
 *
 * # Domain events
 * npx tsx ./scripts/simulate_workos_event.ts \
 *   --workspace-id <workspace-sId> \
 *   --event-type domain.verified \
 *   --domain "example.com" \
 *   --execute
 *
 * Supported event types:
 * - group.created, group.updated, group.deleted
 * - user.created, user.updated, user.deleted
 * - group.user_added, group.user_removed
 * - domain.verified, domain.verification_failed
 * - organization.updated
 */

const SUPPORTED_EVENT_TYPES = [
  "group.created",
  "group.updated",
  "group.deleted",
  "user.created",
  "user.updated",
  "user.deleted",
  "group.user_added",
  "group.user_removed",
  "domain.verified",
  "domain.verification_failed",
  "organization.updated",
] as const;

type SupportedEventType = (typeof SUPPORTED_EVENT_TYPES)[number];

function mapToWorkOSEventType(eventType: SupportedEventType): string {
  const mapping: Record<SupportedEventType, string> = {
    "group.created": "dsync.group.created",
    "group.updated": "dsync.group.updated",
    "group.deleted": "dsync.group.deleted",
    "user.created": "dsync.user.created",
    "user.updated": "dsync.user.updated",
    "user.deleted": "dsync.user.deleted",
    "group.user_added": "dsync.group.user_added",
    "group.user_removed": "dsync.group.user_removed",
    "domain.verified": "organization_domain.verified",
    "domain.verification_failed": "organization_domain.verification_failed",
    "organization.updated": "organization.updated",
  };
  return mapping[eventType];
}

makeScript(
  {
    workspaceId: {
      type: "string",
      alias: "w",
      describe: "Workspace sId",
      demandOption: true,
    },
    eventType: {
      type: "string",
      alias: "t",
      choices: SUPPORTED_EVENT_TYPES,
      describe: "Event type",
      demandOption: true,
    },
    groupName: {
      type: "string",
      alias: "g",
      describe: "Group name (required for group.created/updated)",
    },
    workosGroupId: {
      type: "string",
      describe:
        "Existing WorkOS Group ID (required for group.deleted, group.user_added/removed)",
    },
    userEmail: {
      type: "string",
      alias: "u",
      describe: "User email (required for user events)",
    },
    userFirstName: {
      type: "string",
      describe: "User first name (optional for user events)",
    },
    userLastName: {
      type: "string",
      describe: "User last name (optional for user events)",
    },
    domain: {
      type: "string",
      alias: "d",
      describe: "Domain name (required for domain events)",
    },
  },
  async (
    {
      workspaceId,
      eventType,
      groupName,
      workosGroupId,
      userEmail,
      userFirstName,
      userLastName,
      domain,
      execute,
    },
    logger
  ) => {
    logger.info(
      { workspaceId, eventType, execute: execute, executeType: typeof execute },
      "Starting WorkOS event simulation"
    );

    if (execute) {
      logger.info("✅ Execute mode: ENABLED - Workflow will be launched");
    } else {
      logger.info("⚠️  Execute mode: DISABLED - This is a dry run");
    }

    // Validate event type
    if (!SUPPORTED_EVENT_TYPES.includes(eventType as SupportedEventType)) {
      throw new Error(
        `Invalid event type: ${eventType}. Supported types: ${SUPPORTED_EVENT_TYPES.join(", ")}`
      );
    }

    // Validate required parameters based on event type
    if (
      (eventType === "group.created" || eventType === "group.updated") &&
      !groupName
    ) {
      throw new Error(`--group-name is required for ${eventType} events`);
    }
    if (eventType === "group.deleted" && !workosGroupId) {
      throw new Error(
        `--workos-group-id is required for ${eventType} events (use an existing WorkOS group ID from the database)`
      );
    }
    if (
      (eventType === "group.user_added" ||
        eventType === "group.user_removed") &&
      (!workosGroupId || !userEmail)
    ) {
      throw new Error(
        `--workos-group-id and --user-email are required for ${eventType} events (use existing IDs)`
      );
    }
    if (eventType.startsWith("user.") && !userEmail) {
      throw new Error(
        `--user-email is required for ${eventType} events` +
          (eventType === "user.deleted"
            ? " (must be an existing provisioned user)"
            : "")
      );
    }
    if (eventType.startsWith("domain.") && !domain) {
      throw new Error(`--domain is required for ${eventType} events`);
    }

    // Get workspace info
    const workspace = await getWorkspaceInfos(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    if (!workspace.workOSOrganizationId) {
      throw new Error(
        `Workspace ${workspaceId} does not have a WorkOS organization ID. ` +
          `This workspace is not configured for SCIM provisioning.`
      );
    }

    logger.info(
      {
        workspaceName: workspace.name,
        workOSOrganizationId: workspace.workOSOrganizationId,
      },
      "Found workspace"
    );

    // Check if auto-create space is enabled (for group events)
    if (eventType.startsWith("group.")) {
      const autoCreateEnabled =
        workspace.metadata?.autoCreateSpaceForProvisionedGroups === true;
      logger.info(
        { autoCreateEnabled },
        "Auto-create space for provisioned groups setting"
      );
    }

    // Generate common IDs
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(7);
    const mockDirectoryId = `directory_${workspace.workOSOrganizationId}`;

    // Create mock event payload based on event type
    let eventPayload: Event;

    if (
      eventType.startsWith("group.") &&
      eventType !== "group.user_added" &&
      eventType !== "group.user_removed"
    ) {
      // Group events (created, updated, deleted)
      // For group.deleted, use the provided workosGroupId; for create/update, use a mock ID
      const groupId =
        workosGroupId || `directory_group_${timestamp}_${randomId}`;
      const directoryGroup = {
        id: groupId,
        idpId: `idp_${groupId}`,
        directoryId: mockDirectoryId,
        organizationId: workspace.workOSOrganizationId,
        name: groupName || "Unknown Group",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rawAttributes: {},
      };

      eventPayload = {
        id: `evt_${timestamp}_${randomId}`,
        event: mapToWorkOSEventType(eventType as SupportedEventType) as any,
        data: directoryGroup as any,
        createdAt: new Date().toISOString(),
      } as Event;

      logger.info(
        {
          eventId: eventPayload.id,
          eventType: eventPayload.event,
          groupId: directoryGroup.id,
          groupName: directoryGroup.name,
        },
        "Created mock group event"
      );
    } else if (eventType.startsWith("user.")) {
      // User events (created, updated, deleted)
      const mockUserId = `directory_user_${timestamp}_${randomId}`;
      const directoryUser = {
        object: "directory_user" as const,
        id: mockUserId,
        idpId: `idp_${mockUserId}`,
        directoryId: mockDirectoryId,
        organizationId: workspace.workOSOrganizationId,
        emails: [{ primary: true, type: "work" as const, value: userEmail! }],
        email: userEmail!,
        firstName: userFirstName || userEmail!.split("@")[0],
        lastName: userLastName || "User",
        jobTitle: null,
        username: userEmail!,
        state: "active" as const,
        customAttributes: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rawAttributes: {},
      };

      eventPayload = {
        id: `evt_${timestamp}_${randomId}`,
        event: mapToWorkOSEventType(eventType as SupportedEventType) as any,
        data: directoryUser as any,
        createdAt: new Date().toISOString(),
      } as Event;

      logger.info(
        {
          eventId: eventPayload.id,
          eventType: eventPayload.event,
          userId: directoryUser.id,
          userEmail: userEmail,
        },
        "Created mock user event"
      );
    } else if (
      eventType === "group.user_added" ||
      eventType === "group.user_removed"
    ) {
      // Group membership events - MUST use existing workosGroupId
      const mockUserId = `directory_user_${timestamp}_${randomId}`;

      const directoryUser = {
        object: "directory_user" as const,
        id: mockUserId,
        idpId: `idp_${mockUserId}`,
        directoryId: mockDirectoryId,
        organizationId: workspace.workOSOrganizationId,
        emails: [{ primary: true, type: "work" as const, value: userEmail! }],
        email: userEmail!,
        firstName: userFirstName || userEmail!.split("@")[0],
        lastName: userLastName || "User",
        jobTitle: null,
        username: userEmail!,
        state: "active" as const,
        customAttributes: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rawAttributes: {},
      };

      // Use the real workosGroupId provided by the user
      const directoryGroup = {
        id: workosGroupId!,
        idpId: `idp_${workosGroupId}`,
        directoryId: mockDirectoryId,
        organizationId: workspace.workOSOrganizationId,
        name: groupName || "Unknown Group",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rawAttributes: {},
      };

      eventPayload = {
        id: `evt_${timestamp}_${randomId}`,
        event: mapToWorkOSEventType(eventType as SupportedEventType) as any,
        data: {
          directoryId: mockDirectoryId,
          user: directoryUser,
          group: directoryGroup,
        } as any,
        createdAt: new Date().toISOString(),
      } as Event;

      logger.info(
        {
          eventId: eventPayload.id,
          eventType: eventPayload.event,
          groupName: groupName,
          userEmail: userEmail,
        },
        "Created mock group membership event"
      );
    } else if (eventType.startsWith("domain.")) {
      // Domain events (verified, verification_failed)
      const organizationDomain = {
        object: "organization_domain" as const,
        id: `org_domain_${timestamp}_${randomId}`,
        organizationId: workspace.workOSOrganizationId,
        domain: domain!,
        state:
          eventType === "domain.verified"
            ? ("verified" as const)
            : ("pending" as const),
        verificationToken: `token_${randomId}`,
        verificationStrategy: "manual" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      eventPayload = {
        id: `evt_${timestamp}_${randomId}`,
        event: mapToWorkOSEventType(eventType as SupportedEventType) as any,
        data: organizationDomain as any,
        createdAt: new Date().toISOString(),
      } as Event;

      logger.info(
        {
          eventId: eventPayload.id,
          eventType: eventPayload.event,
          domain: domain,
          state: organizationDomain.state,
        },
        "Created mock domain event"
      );
    } else if (eventType === "organization.updated") {
      // Organization update event
      const organization = {
        object: "organization" as const,
        id: workspace.workOSOrganizationId,
        name: workspace.name,
        allowProfilesOutsideOrganization: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        domains: domain
          ? [
              {
                object: "organization_domain" as const,
                id: `org_domain_${timestamp}_${randomId}`,
                organizationId: workspace.workOSOrganizationId,
                domain: domain,
                state: "verified" as const,
                verificationToken: `token_${randomId}`,
                verificationStrategy: "manual" as const,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ]
          : [],
      };

      eventPayload = {
        id: `evt_${timestamp}_${randomId}`,
        event: mapToWorkOSEventType(eventType as SupportedEventType) as any,
        data: organization as any,
        createdAt: new Date().toISOString(),
      } as Event;

      logger.info(
        {
          eventId: eventPayload.id,
          eventType: eventPayload.event,
          organizationId: workspace.workOSOrganizationId,
        },
        "Created mock organization event"
      );
    } else {
      throw new Error(`Unhandled event type: ${eventType}`);
    }

    if (!execute) {
      logger.info("DRY RUN MODE - Would launch workflow with the following:");
      logger.info({ eventPayload }, "Event payload");
      logger.info("⚠️  Use --execute flag to actually launch the workflow");
      return;
    }

    // Launch the workflow
    logger.info("Launching workOSEventsWorkflow...");
    const result = await launchWorkOSEventsWorkflow({ eventPayload });

    if (result.isErr()) {
      logger.error({ error: result.error }, "Failed to launch workflow");
      throw result.error;
    }

    logger.info(
      { workflowId: result.value },
      "✅ Successfully launched workflow"
    );

    // Provide event-specific guidance
    logger.info("The workflow will process the event:");

    if (eventType === "group.created" || eventType === "group.updated") {
      logger.info(`  • Create/update provisioned group "${groupName}"`);
      const autoCreateEnabled =
        workspace.metadata?.autoCreateSpaceForProvisionedGroups === true;
      if (autoCreateEnabled) {
        logger.info(
          `  • Auto-create restricted space "${groupName}" (feature is ENABLED)`
        );
      } else {
        logger.info("  • Skip space creation (feature is DISABLED)");
      }
    } else if (eventType === "group.deleted") {
      logger.info(`  • Delete provisioned group "${groupName}"`);
      logger.info(
        "  • Associated space will remain (preserved for data safety)"
      );
    } else if (eventType === "user.created" || eventType === "user.updated") {
      logger.info(`  • Create/update user ${userEmail}`);
      logger.info("  • Create workspace membership if needed");
    } else if (eventType === "user.deleted") {
      logger.info(`  • Remove user ${userEmail} from workspace`);
      logger.info("  • Revoke membership and remove from all groups");
    } else if (eventType === "group.user_added") {
      logger.info(`  • Add user ${userEmail} to group "${groupName}"`);
      logger.info("  • Grant space access if group has associated space");
      logger.info(
        "  • Update user role if special group (dust-admins/dust-builders)"
      );
    } else if (eventType === "group.user_removed") {
      logger.info(`  • Remove user ${userEmail} from group "${groupName}"`);
      logger.info("  • Revoke space access if group has associated space");
      logger.info("  • Update user role if special group");
    } else if (eventType === "domain.verified") {
      logger.info(`  • Add verified domain ${domain} to workspace`);
    } else if (eventType === "domain.verification_failed") {
      logger.info(`  • Remove domain ${domain} from workspace`);
    } else if (eventType === "organization.updated") {
      logger.info("  • Sync organization domains with workspace");
    }
  }
);
