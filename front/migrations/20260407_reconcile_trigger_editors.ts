import { QueryTypes } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { frontSequelize } from "@app/lib/resources/storage";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types/shared/model_id";

// Last Friday 2026-04-03 at 09:00 UTC — the cutoff for the bug window.
const BUG_WINDOW_START = "2026-04-03T09:00:00Z";

interface AffectedTrigger {
  triggerId: ModelId;
  triggerName: string;
  workspaceModelId: ModelId;
  workspaceId: string;
  currentEditorId: ModelId;
  currentEditorSId: string;
  currentEditorEmail: string;
  originalUserId: ModelId;
  originalUserSId: string;
  originalUserEmail: string;
}

async function findAffectedTriggers(): Promise<AffectedTrigger[]> {
  // For each trigger updated by an admin since the bug window, find the
  // original editor by looking at who the last pre-bug conversation was
  // created for (userId on the first user_message).
  return frontSequelize.query<AffectedTrigger>(
    `
    SELECT
      t.id AS "triggerId",
      t.name AS "triggerName",
      t."workspaceId",
      w."sId" AS "workspaceId",
      t.editor AS "currentEditorId",
      curr_u."sId" AS "currentEditorSId",
      curr_u.email AS "currentEditorEmail",
      um."userId" AS "originalUserId",
      orig_u."sId" AS "originalUserSId",
      orig_u.email AS "originalUserEmail"
    FROM triggers t
    JOIN users curr_u ON curr_u.id = t.editor
    JOIN workspaces w ON w.id = t."workspaceId"
    JOIN memberships m
      ON m."userId" = t.editor
     AND m."workspaceId" = t."workspaceId"
     AND m.role = 'admin'
     AND m."endAt" IS NULL
    -- Latest conversation before the bug window.
    JOIN LATERAL (
      SELECT c.id
      FROM conversations c
      WHERE c."triggerId" = t.id
        AND c."createdAt" < :bugWindowStart
      ORDER BY c."createdAt" DESC
      LIMIT 1
    ) last_conv ON true
    -- First user_message in that conversation.
    JOIN LATERAL (
      SELECT um."userId"
      FROM messages msg
      JOIN user_messages um ON um.id = msg."userMessageId"
      WHERE msg."conversationId" = last_conv.id
        AND msg."userMessageId" IS NOT NULL
        AND um."userId" IS NOT NULL
      ORDER BY msg.rank ASC
      LIMIT 1
    ) um ON true
    JOIN users orig_u ON orig_u.id = um."userId"
    WHERE t."updatedAt" >= :bugWindowStart
      AND t.editor != um."userId"
    ORDER BY t."workspaceId", t.id
    `,
    {
      replacements: { bugWindowStart: BUG_WINDOW_START },
      type: QueryTypes.SELECT,
    }
  );
}

makeScript({}, async ({ execute }, logger) => {
  const affected = await findAffectedTriggers();

  if (affected.length === 0) {
    logger.info("No affected triggers found.");
    return;
  }

  logger.info({ count: affected.length }, "Found affected triggers");

  for (const row of affected) {
    logger.info(
      {
        triggerId: row.triggerId,
        triggerName: row.triggerName,
        currentEditor: row.currentEditorEmail,
        originalEditor: row.originalUserEmail,
      },
      "Affected trigger"
    );

    if (!execute) {
      continue;
    }

    const triggerSId = TriggerResource.modelIdToSId({
      id: row.triggerId,
      workspaceId: row.workspaceModelId,
    });

    // Auth as the current (admin) editor to pass the permission check.
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      row.currentEditorSId,
      row.workspaceId
    );

    const result = await TriggerResource.update(adminAuth, triggerSId, {
      editor: row.originalUserId,
    });

    if (result.isErr()) {
      logger.error(
        { triggerId: row.triggerId, error: result.error.message },
        "Failed to restore trigger editor"
      );
      continue;
    }

    // Re-upsert the Temporal workflow under the original user's identity.
    const originalUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
      row.originalUserSId,
      row.workspaceId
    );

    const trigger = await TriggerResource.fetchById(
      originalUserAuth,
      triggerSId
    );
    if (trigger && trigger.status === "enabled") {
      const upsertResult =
        await trigger.upsertTemporalWorkflow(originalUserAuth);
      if (upsertResult.isErr()) {
        logger.error(
          { triggerId: row.triggerId, error: upsertResult.error.message },
          "Failed to re-upsert Temporal workflow"
        );
        continue;
      }
    }

    logger.info(
      { triggerId: row.triggerId, restoredEditor: row.originalUserEmail },
      "Restored trigger editor"
    );
  }

  logger.info(
    { count: affected.length, execute },
    execute ? "Reconciliation complete" : "Dry run complete (use --execute)"
  );
});
