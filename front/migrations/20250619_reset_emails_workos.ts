import { parse } from "csv-parse";
import * as fs from "fs";

import { sendEmailWithTemplate } from "@app/lib/api/email";
import { getWorkOS } from "@app/lib/api/workos/client";
import { fetchWorkOSUserWithEmail } from "@app/lib/api/workos/user";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { normalizeError } from "@app/types";

interface CsvRecord {
  email: string;
}

const readCsvFile = async (filePath: string): Promise<CsvRecord[]> => {
  const parser = parse({
    delimiter: ",",
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const records: CsvRecord[] = [];
  fs.createReadStream(filePath).pipe(parser);

  for await (const record of parser) {
    records.push(record);
  }

  return records;
};

const sendPasswordResetEmail = async (
  email: string,
  execute: boolean,
  logger: Logger
): Promise<{ success: boolean; error?: string }> => {
  const childLogger = logger.child({ email });

  try {
    // First, check if user exists in WorkOS
    const userResult = await fetchWorkOSUserWithEmail(email);
    if (userResult.isErr()) {
      childLogger.warn("User not found in WorkOS");
      return { success: false, error: "User not found in WorkOS" };
    }

    const user = userResult.value;
    childLogger.info({ workOSUserId: user.id }, "Found user in WorkOS");

    if (execute) {
      // Send password reset email via WorkOS
      await getWorkOS().userManagement.sendPasswordResetEmail({
        email: user.email,
        passwordResetUrl: `https://dust.tt/reset-password?email=${encodeURIComponent(user.email)}`,
      });

      childLogger.info("WorkOS password reset email sent");

      // Also send our custom email with explanation
      const emailResult = await sendEmailWithTemplate({
        to: email,
        from: {
          name: "Dust team",
          email: "team@dust.tt",
        },
        subject: "[Dust] Password Reset Required - Important Update",
        body: `<p>We're writing to inform you about an important update to your Dust account authentication.</p>
        
        <p>As part of our ongoing migration to improve security and user experience, we need you to reset your password.</p>
        
        <p>You should have received a password reset email from WorkOS. Please check your inbox and follow the instructions to reset your password.</p>
        
        <p>If you don't see the reset email, please check your spam folder or contact our support team.</p>
        
        <p>Thank you for your understanding and for being a valued Dust user.</p>`,
      });

      if (emailResult.isErr()) {
        childLogger.error(
          { error: emailResult.error },
          "Failed to send notification email"
        );
        // Don't fail the operation if our notification email fails
      } else {
        childLogger.info("Successfully sent notification email");
      }

      return { success: true };
    } else {
      childLogger.info(
        "Would send password reset email via WorkOS and notification email"
      );
      return { success: true };
    }
  } catch (error) {
    childLogger.error({ error }, "Error processing password reset for user");
    return { success: false, error: normalizeError(error).message };
  }
};

makeScript(
  {
    csvPath: {
      alias: "csv",
      describe: "Path to the CSV file containing user emails",
      type: "string",
      demandOption: true,
    },
    concurrency: {
      alias: "c",
      describe: "Number of concurrent operations",
      type: "number",
      default: 5,
    },
  },
  async ({ csvPath, concurrency, execute }, logger) => {
    logger.info({ csvPath, execute }, "Starting password reset email script");

    // Read CSV file
    let records: CsvRecord[];
    try {
      records = await readCsvFile(csvPath);
      logger.info(`Read ${records.length} records from CSV file`);
    } catch (error) {
      logger.error({ error, csvPath }, "Failed to read CSV file");
      throw error;
    }

    // Validate CSV structure
    if (records.length === 0) {
      throw new Error("CSV file is empty");
    }

    const firstRecord = records[0];
    if (!firstRecord || !("email" in firstRecord)) {
      throw new Error("CSV file must have an 'email' column");
    }

    // Filter out invalid emails
    const validRecords = records.filter((record) => {
      if (!record.email || typeof record.email !== "string") {
        logger.warn({ record }, "Skipping record with invalid email");
        return false;
      }
      return true;
    });

    logger.info(`Processing ${validRecords.length} valid email records`);

    // Process users with concurrency control
    const results = await concurrentExecutor(
      validRecords,
      async (record) => {
        const result = await sendPasswordResetEmail(
          record.email.trim().toLowerCase(),
          execute,
          logger
        );
        return { email: record.email, ...result };
      },
      { concurrency }
    );

    // Summary
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    logger.info(
      {
        total: results.length,
        successful,
        failed,
        execute,
      },
      "Password reset email script completed"
    );

    // Log failures
    const failures = results.filter((r) => !r.success);
    if (failures.length > 0) {
      logger.warn({ failures }, "Some operations failed");
    }

    if (execute) {
      logger.info(`Successfully sent ${successful} password reset emails`);
    } else {
      logger.info(`Would send ${successful} password reset emails`);
    }
  }
);
