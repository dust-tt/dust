/**
 * Floor startDate and expirationDate of all credits to the hour boundary using
 * floorToHourISO.
 *
 * For each credit row in the `credits` table:
 * - If startDate is set and not already on an hour boundary, update it to the
 *   floored value.
 * - If expirationDate is set and not already on an hour boundary, update it to
 *   the floored value.
 *
 * Idempotent: re-running will skip rows already on an hour boundary.
 *
 * Run with: npx tsx scripts/floor_credits_dates_to_hour.ts [--execute] [--workspaceId <sId>]
 */

import { Authenticator } from "@app/lib/auth";
import { floorToHourISO } from "@app/lib/metronome/client";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { CreditModel } from "@app/lib/resources/storage/models/credits";
import type { Logger } from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

async function floorCreditsDatesForWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const credits = await CreditResource.listAll(auth);

  for (const credit of credits) {
    const updates: { startDate?: Date; expirationDate?: Date } = {};

    if (credit.startDate !== null) {
      const flooredStartDate = new Date(floorToHourISO(credit.startDate));
      if (flooredStartDate.getTime() !== credit.startDate.getTime()) {
        updates.startDate = flooredStartDate;
      }
    }

    if (credit.expirationDate !== null) {
      const flooredExpirationDate = new Date(
        floorToHourISO(credit.expirationDate)
      );
      if (flooredExpirationDate.getTime() !== credit.expirationDate.getTime()) {
        updates.expirationDate = flooredExpirationDate;
      }
    }

    if (
      updates.startDate === undefined &&
      updates.expirationDate === undefined
    ) {
      continue;
    }

    logger.info(
      {
        workspaceId: workspace.sId,
        creditId: credit.id,
        startDate: credit.startDate?.toISOString() ?? null,
        flooredStartDate: updates.startDate?.toISOString() ?? null,
        expirationDate: credit.expirationDate?.toISOString() ?? null,
        flooredExpirationDate: updates.expirationDate?.toISOString() ?? null,
      },
      execute
        ? "[Floor Credits Dates] Updating credit dates"
        : "[Floor Credits Dates] [DRY RUN] Would update credit dates"
    );

    if (!execute) {
      continue;
    }

    try {
      await CreditModel.update(updates, {
        where: { id: credit.id, workspaceId: workspace.id },
      });
    } catch (error) {
      logger.error(
        {
          workspaceId: workspace.sId,
          creditId: credit.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "[Floor Credits Dates] Failed to update credit dates"
      );
    }
  }
}

makeScript(
  {
    workspaceId: {
      type: "string" as const,
      description:
        "Optional workspace sId to process (processes all if omitted)",
      required: false,
    },
    fromWorkspaceId: {
      type: "number" as const,
      description:
        "Resume from this numeric workspace model id (skips workspaces with id < this value)",
      required: false,
    },
  },
  async ({ workspaceId, fromWorkspaceId, execute }, logger) => {
    await runOnAllWorkspaces(
      async (workspace) => {
        await floorCreditsDatesForWorkspace(workspace, execute, logger);
      },
      { concurrency: 4, wId: workspaceId, fromWorkspaceId }
    );
  }
);
