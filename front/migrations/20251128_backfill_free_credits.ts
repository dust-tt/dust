import readline from "readline";

import { Authenticator } from "@app/lib/auth";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { CreditModel } from "@app/lib/resources/storage/models/credits";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const DEFAULT_EXPIRATION_DAYS = 5;

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

async function addFreeCredits(
  execute: boolean,
  amountCents: number,
  expirationDate: Date
) {
  const workspaces = await WorkspaceModel.findAll();

  logger.info(
    {
      execute,
      workspaceCount: workspaces.length,
      amountCents,
      expirationDate: expirationDate.toISOString(),
    },
    `Adding free credits to ${workspaces.length} workspaces`
  );

  // Count how many would be added
  let toAddCount = 0;
  let skippedCount = 0;

  for (const workspace of workspaces) {
    const idempotencyKey = `backfill-free-${workspace.id}-${expirationDate.toISOString().split("T")[0]}`;

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
      skippedCount++;
    } else {
      logger.info(
        { workspaceSId: workspace.sId, workspaceId: workspace.id },
        "Would add credit to workspace"
      );
      toAddCount++;
    }
  }

  logger.info({ toAddCount, skippedCount }, "Summary");

  if (!execute || toAddCount === 0) {
    return;
  }

  const confirmed = await confirmExecution(
    `About to add ${toAddCount} free credits (${amountCents}¢ each). Continue?`
  );
  if (!confirmed) {
    logger.info("Aborted.");
    return;
  }

  let addedCount = 0;
  for (const workspace of workspaces) {
    const idempotencyKey = `backfill-free-${workspace.id}-${expirationDate.toISOString().split("T")[0]}`;

    const existingCredit = await CreditModel.findOne({
      where: {
        workspaceId: workspace.id,
        invoiceOrLineItemId: idempotencyKey,
      },
    });

    if (existingCredit) {
      continue;
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
      { creditId: credit.id, workspaceSId: workspace.sId, workspaceId: workspace.id },
      "Added credit to workspace"
    );
    addedCount++;
  }

  logger.info({ addedCount }, "Done adding credits");
}

async function removeFreeCredits(execute: boolean, expirationDate: Date) {
  logger.info(
    { execute, expirationDate: expirationDate.toISOString() },
    "Removing free credits"
  );

  const creditsToRemove = await CreditModel.findAll({
    where: {
      type: "free",
      expirationDate,
    },
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
    where: {
      type: "free",
      expirationDate,
    },
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
      describe: `Expiration date YYYY-MM-DD for 'add' (default: ${DEFAULT_EXPIRATION_DAYS} days from now), or exact expiration date to match for 'remove'`,
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
        : new Date(
            Date.now() + DEFAULT_EXPIRATION_DAYS * 24 * 60 * 60 * 1000
          );

      await addFreeCredits(execute, amountCents, expirationDate);
    } else if (action === "remove") {
      if (!endDate) {
        throw new Error("endDate is required for remove action");
      }

      await removeFreeCredits(execute, parseDate(endDate));
    } else {
      throw new Error(`Unknown action: ${action}. Use 'add' or 'remove'.`);
    }
  }
);
