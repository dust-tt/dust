import readline from "readline";

import { Authenticator } from "@app/lib/auth";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { CreditModel } from "@app/lib/resources/storage/models/credits";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { makeScript } from "@app/scripts/helpers";

const DEFAULT_EXPIRATION_DAYS = 5;

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

  console.log(
    `[execute=${execute}] Adding free credits to ${workspaces.length} workspaces`
  );
  console.log(`  Amount: ${amountCents} cents ($${amountCents / 100})`);
  console.log(`  Expiration: ${expirationDate.toISOString()}`);

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
      console.log(
        `  Skipping workspace ${workspace.sId} (${workspace.id}): credit already exists`
      );
      skippedCount++;
    } else {
      console.log(
        `  Would add credit to workspace ${workspace.sId} (${workspace.id})`
      );
      toAddCount++;
    }
  }

  console.log(`\nSummary:`);
  console.log(`  To add: ${toAddCount}`);
  console.log(`  Skipped (already exists): ${skippedCount}`);

  if (!execute || toAddCount === 0) {
    return;
  }

  const confirmed = await confirmExecution(
    `About to add ${toAddCount} free credits (${amountCents}¢ each). Continue?`
  );
  if (!confirmed) {
    console.log("Aborted.");
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

    console.log(
      `  Added credit ${credit.id} to workspace ${workspace.sId} (${workspace.id})`
    );
    addedCount++;
  }

  console.log(`\nDone: added ${addedCount} credits.`);
}

async function removeFreeCredits(execute: boolean, expirationDate: Date) {
  console.log(
    `[execute=${execute}] Removing free credits with expirationDate = ${expirationDate.toISOString()}`
  );

  const creditsToRemove = await CreditModel.findAll({
    where: {
      type: "free",
      expirationDate,
    },
  });

  console.log(`  Found ${creditsToRemove.length} credits to remove`);

  for (const credit of creditsToRemove) {
    console.log(
      `  Credit ${credit.id}: workspaceId=${credit.workspaceId}, expirationDate=${credit.expirationDate?.toISOString()}, amount=${credit.initialAmountCents}c`
    );
  }

  if (!execute || creditsToRemove.length === 0) {
    return;
  }

  const confirmed = await confirmExecution(
    `About to delete ${creditsToRemove.length} free credits. Continue?`
  );
  if (!confirmed) {
    console.log("Aborted.");
    return;
  }

  const deletedCount = await CreditModel.destroy({
    where: {
      type: "free",
      expirationDate,
    },
  });
  console.log(`\nDone: deleted ${deletedCount} credits.`);
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
