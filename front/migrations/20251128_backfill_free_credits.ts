import { Op } from "sequelize";

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

  let addedCount = 0;
  let skippedCount = 0;

  for (const workspace of workspaces) {
    const idempotencyKey = `backfill-free-${workspace.id}-${expirationDate.toISOString().split("T")[0]}`;

    // Check if credit already exists
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
      continue;
    }

    if (execute) {
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
    } else {
      console.log(
        `  Would add credit to workspace ${workspace.sId} (${workspace.id})`
      );
    }
    addedCount++;
  }

  console.log(`\nSummary:`);
  console.log(`  Added: ${addedCount}`);
  console.log(`  Skipped (already exists): ${skippedCount}`);
}

async function removeFreeCredits(execute: boolean, beforeStartDate: Date) {
  console.log(
    `[execute=${execute}] Removing free credits with startDate < ${beforeStartDate.toISOString()}`
  );

  const creditsToRemove = await CreditModel.findAll({
    where: {
      type: "free",
      startDate: {
        [Op.lt]: beforeStartDate,
      },
    },
  });

  console.log(`  Found ${creditsToRemove.length} credits to remove`);

  for (const credit of creditsToRemove) {
    console.log(
      `  Credit ${credit.id}: workspaceId=${credit.workspaceId}, startDate=${credit.startDate?.toISOString()}, amount=${credit.initialAmountCents}c`
    );
  }

  if (execute && creditsToRemove.length > 0) {
    const deletedCount = await CreditModel.destroy({
      where: {
        type: "free",
        startDate: {
          [Op.lt]: beforeStartDate,
        },
      },
    });
    console.log(`\n  Deleted ${deletedCount} credits`);
  }
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
      describe: `Expiration date YYYY-MM-DD (default: ${DEFAULT_EXPIRATION_DAYS} days from now)`,
    },
    beforeStartDate: {
      type: "string",
      describe:
        "Remove free credits with startDate before this date YYYY-MM-DD (required for 'remove')",
    },
  },
  async ({ execute, action, amountCents, endDate, beforeStartDate }) => {
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
      if (!beforeStartDate) {
        throw new Error("beforeStartDate is required for remove action");
      }

      await removeFreeCredits(execute, parseDate(beforeStartDate));
    } else {
      throw new Error(`Unknown action: ${action}. Use 'add' or 'remove'.`);
    }
  }
);
