/**
 * List Metronome credits/commits for workspaces that have a Dust credit row
 * created in the given date range. Pre-filtering by the Dust DB avoids calling
 * Metronome for every workspace (rate-limit friendly).
 *
 * Each matching Metronome balance is logged with a direct UI URL.
 *
 * Run with:
 *   npx tsx scripts/list_metronome_credits_commits.ts \
 *     --startDate 2025-01-01T00:00:00Z --endDate 2025-06-01T00:00:00Z \
 *     [--workspaceId <sId>]
 */

import { getMetronomeClient } from "@app/lib/metronome/client";
import { CreditModel } from "@app/lib/resources/storage/models/credits";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import type { LightWorkspaceType } from "@app/types/user";
import { Op } from "sequelize";

import { makeScript } from "./helpers";

const PAGE_SIZE = 25;

async function processWorkspace({
  workspace,
  startDateMs,
  endDateMs,
  archive,
  execute,
  counters,
  logger,
}: {
  workspace: LightWorkspaceType;
  startDateMs: number;
  endDateMs: number;
  archive: boolean;
  execute: boolean;
  counters: {
    commitCount: number;
    creditCount: number;
    archivedCount: number;
    archiveFailedCount: number;
  };
  logger: Logger;
}): Promise<void> {
  const metronomeCustomerId = workspace.metronomeCustomerId;
  if (!metronomeCustomerId) {
    return;
  }

  const client = getMetronomeClient();

  let balancesCursor: string | undefined = undefined;
  do {
    const balancesPage = await client.v1.contracts.listBalances({
      customer_id: metronomeCustomerId,
      include_balance: true,
      include_contract_balances: true,
      limit: PAGE_SIZE,
      next_page: balancesCursor,
    });

    for (const entry of balancesPage.data) {
      const scheduleItems = entry.access_schedule?.schedule_items ?? [];
      const startingAt = scheduleItems[0]?.starting_at ?? null;
      const endingBefore =
        scheduleItems[scheduleItems.length - 1]?.ending_before ?? null;

      const startingAtMs = startingAt ? new Date(startingAt).getTime() : null;
      if (startingAtMs === null || startingAtMs < startDateMs) {
        continue;
      }
      if (startingAtMs >= endDateMs) {
        continue;
      }

      if (entry.name?.includes("MAU")) {
        continue;
      }

      const kind = entry.type === "CREDIT" ? "credit" : "commit";
      if (kind === "credit") {
        counters.creditCount++;
      } else {
        counters.commitCount++;
      }

      const amount = scheduleItems.reduce((s, i) => s + i.amount, 0);
      const envPath = isDevelopment() ? "sandbox/" : "";
      const url = `https://app.metronome.com/${envPath}customers/${metronomeCustomerId}/commits-and-credits/${entry.id}`;

      logger.info(
        {
          workspaceId: workspace.sId,
          workspaceName: workspace.name,
          metronomeCustomerId,
          kind,
          id: entry.id,
          name: entry.name,
          productName: entry.product.name,
          type: entry.type,
          scope: entry.contract?.id ? "contract" : "customer",
          contractId: entry.contract?.id ?? null,
          amount,
          balance: entry.balance ?? null,
          creditType: entry.access_schedule?.credit_type?.name ?? null,
          startingAt,
          endingBefore,
          url,
        },
        `[Metronome] ${kind}`
      );

      if (!archive) {
        continue;
      }

      if (!execute) {
        logger.info(
          { workspaceId: workspace.sId, kind, id: entry.id },
          `[Metronome] [DRYRUN] Would archive ${kind}`
        );
        continue;
      }

      try {
        const archivePath =
          kind === "credit"
            ? "/v2/contracts/credits/archive"
            : "/v2/contracts/commits/archive";
        const archiveBody =
          kind === "credit"
            ? { customer_id: metronomeCustomerId, credit_id: entry.id }
            : { customer_id: metronomeCustomerId, commit_id: entry.id };
        await client.post(archivePath, { body: archiveBody });
        counters.archivedCount++;
        logger.info(
          { workspaceId: workspace.sId, kind, id: entry.id },
          `[Metronome] Archived ${kind}`
        );
      } catch (err) {
        counters.archiveFailedCount++;
        logger.error(
          {
            workspaceId: workspace.sId,
            kind,
            id: entry.id,
            error: String(err),
          },
          `[Metronome] Failed to archive ${kind}`
        );
      }
    }

    balancesCursor = balancesPage.next_page || undefined;
  } while (balancesCursor);
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      type: "string" as const,
      describe:
        "Workspace sId to further restrict. Omit to process all workspaces with credits in range.",
    },
    startDate: {
      type: "string" as const,
      demandOption: true,
      describe:
        "Include workspaces with Dust credits created on or after this ISO datetime (e.g. 2025-01-01T00:00:00Z).",
    },
    endDate: {
      type: "string" as const,
      demandOption: true,
      describe:
        "Include workspaces with Dust credits created strictly before this ISO datetime (e.g. 2025-06-01T00:00:00Z).",
    },
    archive: {
      type: "boolean" as const,
      default: false,
      describe:
        "Archive matching Metronome credits/commits via /v2/contracts/{credits,commits}/archive. Requires --execute.",
    },
  },
  async ({ workspaceId, startDate, endDate, archive, execute }, logger) => {
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    if (Number.isNaN(startDateObj.getTime())) {
      throw new Error(`Invalid --startDate: ${startDate}`);
    }
    if (Number.isNaN(endDateObj.getTime())) {
      throw new Error(`Invalid --endDate: ${endDate}`);
    }

    const creditRows = await CreditModel.findAll({
      attributes: ["workspaceId"],
      where: {
        createdAt: {
          [Op.gte]: startDateObj,
          [Op.lt]: endDateObj,
        },
      },
      group: ["workspaceId"],
      raw: true,
    });
    const workspaceModelIds = creditRows.map((r) => r.workspaceId);

    logger.info(
      { matchingWorkspaces: workspaceModelIds.length, startDate, endDate },
      "Found workspaces with credits in range"
    );

    if (workspaceModelIds.length === 0) {
      return;
    }

    let workspaces: LightWorkspaceType[] = [];
    if (workspaceId) {
      const ws = await WorkspaceResource.fetchById(workspaceId);
      if (!ws) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }
      if (!workspaceModelIds.includes(ws.id)) {
        logger.info(
          { workspaceId },
          "Workspace has no credits in the given range — nothing to do"
        );
        return;
      }
      workspaces = [renderLightWorkspaceType({ workspace: ws })];
    } else {
      const wsResources =
        await WorkspaceResource.fetchByModelIds(workspaceModelIds);
      workspaces = wsResources.map((w) =>
        renderLightWorkspaceType({ workspace: w })
      );
    }

    const counters = {
      commitCount: 0,
      creditCount: 0,
      archivedCount: 0,
      archiveFailedCount: 0,
    };

    await concurrentExecutor(
      workspaces,
      (workspace) =>
        processWorkspace({
          workspace,
          startDateMs: startDateObj.getTime(),
          endDateMs: endDateObj.getTime(),
          archive,
          execute,
          counters,
          logger,
        }),
      { concurrency: 2 }
    );

    logger.info(
      {
        workspaceCount: workspaces.length,
        commitCount: counters.commitCount,
        creditCount: counters.creditCount,
        archivedCount: counters.archivedCount,
        archiveFailedCount: counters.archiveFailedCount,
        dryRun: archive && !execute,
      },
      "Done listing Metronome credits and commits"
    );
  }
);
