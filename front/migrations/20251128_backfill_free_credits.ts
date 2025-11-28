import readline from "readline";

import { Authenticator } from "@app/lib/auth";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { CreditModel } from "@app/lib/resources/storage/models/credits";
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
    initialAmountCents: amountCents,
    consumedAmountCents: 0,
    discount: null,
    invoiceOrLineItemId: idempotencyKey,
  });

  await credit.start(new Date(), expirationDate);

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
  expirationDate: Date
) {
  logger.info(
    {
      execute,
      amountCents,
      expirationDate: expirationDate.toISOString(),
      concurrency: CONCURRENCY,
    },
    "Adding free credits"
  );

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
  expirationDate: Date | "all"
) {
  const isAll = expirationDate === "all";

  logger.info(
    {
      execute,
      expirationDate: isAll ? "all" : expirationDate.toISOString(),
    },
    "Removing free credits"
  );

  const whereClause: { type: "free"; expirationDate?: Date } = { type: "free" };
  if (!isAll) {
    whereClause.expirationDate = expirationDate;
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
        amountCents: credit.initialAmountCents,
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
  },
  async ({ execute, action, amountCents, endDate }) => {
    // eslint-disable-next-line no-console
    console.log(DISCLAIMER);

    if (action === "add") {
      if (!amountCents || amountCents <= 0) {
        throw new Error("amountCents is required and must be positive for add");
      }

      const expirationDate = endDate
        ? parseDate(endDate)
        : new Date(Date.now() + DEFAULT_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

      await addFreeCredits(execute, amountCents, expirationDate);
    } else if (action === "remove") {
      if (!endDate) {
        throw new Error(
          "endDate is required for remove action (use 'all' to remove all free credits)"
        );
      }

      const expirationDate = endDate === "all" ? "all" : parseDate(endDate);
      await removeFreeCredits(execute, expirationDate);
    } else {
      throw new Error(`Unknown action: ${action}. Use 'add' or 'remove'.`);
    }
  }
);
