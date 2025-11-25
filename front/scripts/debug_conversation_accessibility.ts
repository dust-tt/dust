import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { makeScript } from "@app/scripts/helpers";

makeScript(
  {
    workspaceId: {
      alias: "w",
      describe: "Workspace ID (sId)",
      type: "string" as const,
      demandOption: true,
    },
    userId: {
      alias: "u",
      describe: "User ID (sId)",
      type: "string" as const,
      demandOption: true,
    },
    conversationId: {
      alias: "c",
      describe: "Conversation ID (sId)",
      type: "string" as const,
      demandOption: true,
    },
  },
  async ({ workspaceId, userId, conversationId, execute }, logger) => {
    if (!execute) {
      logger.info(
        "Dry run mode. Use --execute to run the script with the following parameters:"
      );
      logger.info({ workspaceId, userId, conversationId });
      return;
    }

    // Create Authenticator from workspace and user
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      userId,
      workspaceId
    );

    // Step 1: Check if conversation exists (bypass permissions)
    logger.info("STEP 1: Checking if conversation exists...");
    const conversationWithoutPermCheck = await ConversationResource.fetchById(
      auth,
      conversationId,
      { dangerouslySkipPermissionFiltering: true }
    );

    if (!conversationWithoutPermCheck) {
      logger.error(
        "✗ Conversation not found in this workspace (or doesn't exist)"
      );
      logger.info("");
      logger.info("Summary:", {
        conversationExists: false,
        userHasAccess: false,
        reason: "Conversation not found",
      });
      return;
    }

    logger.info("✓ Conversation exists", {
      conversationId: conversationWithoutPermCheck.sId,
      visibility: conversationWithoutPermCheck.visibility,
      requestedSpaceIds: conversationWithoutPermCheck.requestedSpaceIds,
      requiredSpacesCount:
        conversationWithoutPermCheck.requestedSpaceIds.length,
    });
    logger.info("");

    // Step 2: Check if user has access (with permission filtering)
    logger.info("STEP 2: Checking user access (with permission filtering)...");
    const conversation = await ConversationResource.fetchById(
      auth,
      conversationId
    );

    if (conversation) {
      logger.info("✓ USER HAS ACCESS TO CONVERSATION", {
        conversationExists: true,
        userHasAccess: true,
        visibility: conversation.visibility,
        requestedSpaceIds: conversation.getRequestedSpaceIdsFromModel(),
      });
      return;
    }

    logger.error("✗ USER CANNOT ACCESS CONVERSATION");

    // Step 3: Debug why access is denied
    logger.info("STEP 3: Debugging access denial...");

    const requestedSpaceIds = conversationWithoutPermCheck.requestedSpaceIds;
    const visibility = conversationWithoutPermCheck.visibility;

    // Check visibility first
    if (visibility === "deleted") {
      logger.info("Issue: Conversation visibility is 'deleted'");
      logger.info("  → Deleted conversations are not accessible");
    }

    logger.info("Space requirements:", {
      requiredSpacesCount: requestedSpaceIds.length,
      requestedSpaceIds: requestedSpaceIds,
    });

    // Fetch and analyze spaces
    logger.info("Fetching space details...");
    const spaces = await SpaceResource.fetchByModelIds(auth, requestedSpaceIds);

    const foundIds = new Set(spaces.map((s) => s.id));
    const missingIds = requestedSpaceIds.filter((id) => !foundIds.has(id));

    if (missingIds.length > 0) {
      logger.error("Missing spaces:", {
        missingCount: missingIds.length,
        missingSpaceIds: missingIds,
      });
      logger.info("  → These spaces are either deleted or user has no access");
    }

    logger.info("Space details:");
    for (const space of spaces) {
      const status = space.deletedAt ? "DELETED" : "ACTIVE";
      logger.info(`  [${space.sId}] ${space.name}`, {
        kind: space.kind,
        status: status,
        deleted: !!space.deletedAt,
      });
    }

    logger.info("SUMMARY");
    logger.info({
      conversationExists: true,
      userHasAccess: false,
      visibility: visibility,
      requiredSpacesCount: requestedSpaceIds.length,
      accessibleSpacesCount: spaces.length,
      missingSpacesCount: missingIds.length,
      reason:
        missingIds.length > 0
          ? `Missing ${missingIds.length} required space(s)`
          : visibility === "deleted"
            ? "Conversation is deleted"
            : "Check space access permissions",
      missingSpaceIds: missingIds.length > 0 ? missingIds : undefined,
    });
  }
);
