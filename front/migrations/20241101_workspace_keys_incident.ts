import { parse } from "csv-parse";
import * as fs from "fs";
import { exit } from "process";

import { sendEmailWithTemplate } from "@app/lib/api/email";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { Workspace } from "@app/lib/models/workspace";
import { getStripeClient } from "@app/lib/plans/stripe";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const MIN_AMOUNT_FOR_REIMBURSEMENT = 1;

const sendIncidentEmailToAdmins = async (
  workspaceId: number,
  cost_in_cents: number,
  reimbursement_in_cents: number,
  currency: string,
  logger: Logger
) => {
  const message = {
    from: {
      name: "Dust team",
      email: "team@dust.tt",
    },
    subject: `[Dust] Incident 2024/10/31`,
    body: `<p>On October the 31st, due to a misconfiguration on our end, from 12:44 to 13:20 our API keys to OpenAI, Anthropic, Gemini and Mistral became unavailable to our systems triggering a fallback to your own API keys for assistants interactions within your workspace.</p>
      <p>While it was great that we were able to serve your conversations on your own keys to avoid disruption, this is also not what you expect as a user. We estimated the tokens cost of the execution of these assistants to ${cost_in_cents / 100} ${currency.toUpperCase()}. We are applying a discount of ${reimbursement_in_cents / 100} ${currency.toUpperCase()} to your account to compensate for it.</p>
      <p>Please reply to this email if you have any questions.</p>`,
  };

  const workspace = await Workspace.findByPk(workspaceId);
  if (!workspace) {
    // Should not happen but just in case
    logger.error(`Workspace ${workspaceId} not found. Skipping email.`);
    return;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const { members: admins } = await getMembers(auth, { roles: ["admin"] });
  const adminEmails = admins.map((u) => u.email);

  return Promise.all(
    adminEmails.map((email) =>
      sendEmailWithTemplate({ ...message, to: [email] })
    )
  );
};

// Basic file read
const readCsvFile = async (filePath: string) => {
  const parser = parse({
    delimiter: ",",
    columns: true, // Use first row as headers
    skip_empty_lines: true,
    trim: true,
    cast: function (value, context) {
      if (
        [
          "workspaceId",
          "number_of_runs",
          "prompt_tokens",
          "completion_tokens",
        ].includes(context.column as string)
      ) {
        // remove the "," from the value and parse as integer
        return parseInt(value.replace(/,/g, ""));
      } else {
        return value;
      }
    },
  });

  const records: any[] = [];
  fs.createReadStream(filePath).pipe(parser);

  for await (const record of parser) {
    records.push(record);
  }

  return records;
};

makeScript(
  {
    csvPath: {
      alias: "csv",
      describe: "Path to the CSV file",
      type: "string",
    },
    mergeCoupons: {
      alias: "merge",
      describe: "Merge coupons",
      type: "boolean",
      default: false,
    },
  },
  async ({ csvPath, mergeCoupons, execute }, logger) => {
    const records = await readCsvFile(csvPath);
    logger.info(`Read ${records.length} records from CSV file`);
    const stripe = getStripeClient();

    // Check that no existing coupons are present
    logger.info(`Checking existing coupons...`);
    const alreadyHasCoupons = [];
    for (const record of records) {
      if (
        record["stripe_subscription_id"] &&
        record["total_tokens_cost_in_dollars"] > MIN_AMOUNT_FOR_REIMBURSEMENT
      ) {
        // Check if the customer already has a coupon
        const subscriptionId = record["stripe_subscription_id"];
        const subscription =
          await stripe.subscriptions.retrieve(subscriptionId);

        if (subscription.discount && subscription.discount.coupon.amount_off) {
          alreadyHasCoupons.push(record);
        }
      }
    }

    if (alreadyHasCoupons.length > 0 && !mergeCoupons) {
      // Stop the script with an error
      logger.error(
        `Some records already have a discount: ${alreadyHasCoupons.map((r) => r["name"]).join(", ")}. Use --merge if you want to merge the existing discount with the new one.`
      );
      exit(1);
    }

    // Process records
    for (const record of records) {
      if (
        record["total_tokens_cost_in_dollars"] > MIN_AMOUNT_FOR_REIMBURSEMENT
      ) {
        if (record["stripe_subscription_id"]) {
          const subscriptionId = record["stripe_subscription_id"];

          const amount =
            Math.ceil(record["total_tokens_cost_in_dollars"]) * 100;
          let finalAmount = amount;

          // Check if the customer already has a coupon
          const subscription =
            await stripe.subscriptions.retrieve(subscriptionId);

          if (
            subscription.discount &&
            subscription.discount.coupon.amount_off
          ) {
            if (!mergeCoupons) {
              // Should not happen as we are checking this before
              // Just in case: stop the script with an error
              throw new Error(
                `Record ${record["name"]} (${record["workspaceId"]}) already has a discount of ${subscription.discount.coupon.amount_off} cents. Use --merge to merge the discounts.`
              );
            } else {
              // Update the amount
              const currentAmount = subscription.discount.coupon.amount_off;
              finalAmount += currentAmount;

              logger.info(
                `Customer already has a coupon: adding ${currentAmount} cents to the amount, now ${amount} cents.`
              );
            }
          }

          if (execute) {
            // Log
            logger.info(
              `Creating one-time coupon for ${record["name"]} (${record["workspaceId"]}) with amount ${amount} cents`
            );

            // Create a one-time coupon
            const coupon = await stripe.coupons.create({
              duration: "once",
              amount_off: finalAmount, // amount in cents
              currency: subscription.currency, // must match the subscription currency
              name: "One-time discount",
            });

            // Apply coupon to subscription
            await stripe.subscriptions.update(subscriptionId, {
              coupon: coupon.id,
            });

            // Send email to admins
            await sendIncidentEmailToAdmins(
              record["workspaceId"],
              record["total_tokens_cost_in_dollars"] * 100,
              amount,
              subscription.currency,
              logger
            );
          } else {
            logger.info(
              `Dry run: would have created one-time coupon for ${record["name"]} (${record["workspaceId"]}) with amount ${amount} cents`
            );
          }
        } else {
          logger.error(
            `Skipping record ${record["name"]} (${record["workspaceId"]}) without stripe_subscription_id`
          );
        }
      } else {
        logger.info(
          `Skipping record ${record["name"]} (${record["workspaceId"]}) with total_tokens_cost_in_dollars less than ${MIN_AMOUNT_FOR_REIMBURSEMENT}$: (${record["total_tokens_cost_in_dollars"]})`
        );
      }
    }
  }
);
