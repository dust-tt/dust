import readline from "readline";

import { Authenticator } from "@app/lib/auth";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { CreditModel } from "@app/lib/resources/storage/models/credits";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";

const DEFAULT_EXPIRATION_DAYS = 5;
const CONCURRENCY = 16;

const DISCLAIMER = `
================================================================================
⚠️  WARNING: SCRIPT CREATED FOR PROGRAMMATIC USAGE (PPUL) TESTING
    DO NOT REUSE AFTER RELEASE UNLESS YOU KNOW WHAT YOU ARE DOING
================================================================================
`;

function parseDate(dateStr: string): Date {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}. Use YYYY-MM-DD.`);
  }
  return date;
}

async function confirmExecution(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`\n⚠️  ${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

function getIdempotencyKey(workspaceId: number, expirationDate: Date): string {
  return `backfill-free-${workspaceId}-${expirationDate.toISOString().split("T")[0]}`;
}

async function addCreditToWorkspace(
  workspace: LightWorkspaceType,
  amountCents: number,
  expirationDate: Date,
  execute: boolean
): Promise<"added" | "skipped"> {
  const idempotencyKey = getIdempotencyKey(workspace.id, expirationDate);

  const existingCredit = await CreditModel.findOne({
    where: {
      workspaceId: workspace.id,
      invoiceOrLineItemId: idempotencyKey,
    },
  });

  if (existingCredit) {
    logger.info(
      { workspaceSId: workspace.sId, workspaceId: workspace.id },
      "Skipping workspace: credit already exists"
    );
    return "skipped";
  }

  if (!execute) {
    logger.info(
      { workspaceSId: workspace.sId, workspaceId: workspace.id },
      "Would add credit to workspace"
    );
    return "added";
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const credit = await CreditResource.makeNew(auth, {
    type: "free",
    initialAmountMicroUsd: amountCents * 10_000,
    consumedAmountMicroUsd: 0,
    discount: null,
    invoiceOrLineItemId: idempotencyKey,
  });

  await credit.start(auth, {
    startDate: new Date(),
    expirationDate,
  });

  logger.info(
    {
      creditId: credit.id,
      workspaceSId: workspace.sId,
      workspaceId: workspace.id,
    },
    "Added credit to workspace"
  );
  return "added";
}

async function addFreeCredits(
  execute: boolean,
  amountCents: number,
  expirationDate: Date,
  wId?: string
) {
  logger.info(
    {
      execute,
      amountCents,
      expirationDate: expirationDate.toISOString(),
      concurrency: CONCURRENCY,
      workspaceId: wId ?? "all",
    },
    "Adding free credits"
  );

  if (wId) {
    const workspace = await WorkspaceModel.findOne({ where: { sId: wId } });
    if (!workspace) {
      throw new Error(`Workspace not found: ${wId}`);
    }

    if (execute) {
      const confirmed = await confirmExecution(
        `About to add free credits (${amountCents}¢) to workspace ${wId}. Continue?`
      );
      if (!confirmed) {
        logger.info("Aborted.");
        return;
      }
    }

    const result = await addCreditToWorkspace(
      renderLightWorkspaceType({ workspace }),
      amountCents,
      expirationDate,
      execute
    );
    logger.info({ result }, "Done");
    return;
  }

  if (execute) {
    const confirmed = await confirmExecution(
      `About to add free credits (${amountCents}¢ each) to all workspaces. Continue?`
    );
    if (!confirmed) {
      logger.info("Aborted.");
      return;
    }
  }

  let addedCount = 0;
  let skippedCount = 0;

  await runOnAllWorkspaces(
    async (workspace) => {
      const result = await addCreditToWorkspace(
        workspace,
        amountCents,
        expirationDate,
        execute
      );
      if (result === "added") {
        addedCount++;
      } else {
        skippedCount++;
      }
    },
    { concurrency: CONCURRENCY }
  );

  logger.info({ addedCount, skippedCount }, "Done");
}

async function removeFreeCredits(
  execute: boolean,
  expirationDate: Date | "all",
  wId?: string
) {
  const isAll = expirationDate === "all";

  logger.info(
    {
      execute,
      expirationDate: isAll ? "all" : expirationDate.toISOString(),
      workspaceId: wId ?? "all",
    },
    "Removing free credits"
  );

  const whereClause: {
    type: "free";
    expirationDate?: Date;
    workspaceId?: number;
  } = { type: "free" };
  if (!isAll) {
    whereClause.expirationDate = expirationDate;
  }

  if (wId) {
    const workspace = await WorkspaceModel.findOne({ where: { sId: wId } });
    if (!workspace) {
      throw new Error(`Workspace not found: ${wId}`);
    }
    whereClause.workspaceId = workspace.id;
  }

  const creditsToRemove = await CreditModel.findAll({
    where: whereClause,
  });

  logger.info({ count: creditsToRemove.length }, "Found credits to remove");

  for (const credit of creditsToRemove) {
    logger.info(
      {
        creditId: credit.id,
        workspaceId: credit.workspaceId,
        expirationDate: credit.expirationDate?.toISOString(),
        amountMicroUsd: credit.initialAmountMicroUsd,
      },
      "Credit to remove"
    );
  }

  if (!execute || creditsToRemove.length === 0) {
    return;
  }

  const confirmed = await confirmExecution(
    `About to delete ${creditsToRemove.length} free credits. Continue?`
  );
  if (!confirmed) {
    logger.info("Aborted.");
    return;
  }

  const deletedCount = await CreditModel.destroy({
    where: whereClause,
  });
  logger.info({ deletedCount }, "Done deleting credits");
}

makeScript(
  {
    action: {
      type: "string",
      describe: "Action to perform: 'add' or 'remove'",
      demandOption: true,
    },
    amountCents: {
      type: "number",
      describe: "Amount in cents for free credits (required for 'add')",
    },
    endDate: {
      type: "string",
      describe: `Expiration date YYYY-MM-DD for 'add' (default: ${DEFAULT_EXPIRATION_DAYS} days from now), or exact expiration date to match for 'remove' (use 'all' to remove all free credits)`,
    },
    wId: {
      type: "string",
      demandOption: false,
      describe: "Workspace sId to process (optional, processes all if omitted)",
    },
  },
  async ({ execute, action, amountCents, endDate, wId }) => {
    // eslint-disable-next-line no-console
    console.log(DISCLAIMER);

    if (action === "add") {
      if (!amountCents || amountCents <= 0) {
        throw new Error("amountCents is required and must be positive for add");
      }

      const expirationDate = endDate
        ? parseDate(endDate)
        : new Date(Date.now() + DEFAULT_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

      await addFreeCredits(execute, amountCents, expirationDate, wId);
    } else if (action === "remove") {
      if (!endDate) {
        throw new Error(
          "endDate is required for remove action (use 'all' to remove all free credits)"
        );
      }

      const expirationDate = endDate === "all" ? "all" : parseDate(endDate);
      await removeFreeCredits(execute, expirationDate, wId);
    } else {
      throw new Error(`Unknown action: ${action}. Use 'add' or 'remove'.`);
    }
  }
);
