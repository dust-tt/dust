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

  // First, check if the user exists in WorkOS.
  const userResult = await fetchWorkOSUserWithEmail(email);
  if (userResult.isErr()) {
    childLogger.warn("User not found in WorkOS");
    return { success: false, error: "User not found in WorkOS" };
  }

  const user = userResult.value;
  childLogger.info({ workOSUserId: user.id }, "Found user in WorkOS");

  if (execute) {
    try {
      // Create a password reset token via WorkOS. The token is included in the URL.
      // /!\ Note that this call also sends an email if the password-reset emails are activated.
      const { passwordResetUrl, userId, email } =
        await getWorkOS().userManagement.createPasswordReset({
          email: user.email,
        });

      childLogger.info("WorkOS password reset email sent");

      // Also send our custom email with an explanation.
      const emailResult = await sendEmailWithTemplate({
        to: email,
        from: {
          name: "Dust team",
          email: "support@dust.help",
        },
        subject: "[Dust] Password Reset Required - Important Update",
        body: `<p>We're writing to inform you about an important update to your Dust account authentication.</p>
        <p>As part of our ongoing migration to improve security and user experience, we need you to reset your password.</p>
        <p>Please click the button below to reset your password:</p>
        <div style="text-align: center; margin: 40px 0;">
          <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
            <tr>
              <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                         border-radius: 8px;
                         box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
                         transition: all 0.3s ease;">
                <a href="${passwordResetUrl}"
                   style="display: inline-block;
                          padding: 16px 32px;
                          color: #ffffff;
                          text-decoration: none;
                          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                          font-size: 16px;
                          font-weight: 600;
                          letter-spacing: 0.5px;
                          border-radius: 8px;
                          text-align: center;
                          min-width: 200px;">
                  🔐 Reset Your Password
                </a>
              </td>
            </tr>
          </table>
        </div>

        <p style="color: #666; font-size: 14px; margin-top: 30px;">If the button doesn't work, you can also copy and paste this link into your browser:</p>
        <div style="background-color: #f8f9fa;
                    border: 1px solid #e9ecef;
                    border-radius: 6px;
                    padding: 12px;
                    margin: 10px 0;
                    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;">
          <p style="word-break: break-all;
                    color: #495057;
                    font-size: 13px;
                    margin: 0;
                    line-height: 1.4;">
            ${passwordResetUrl}
          </p>
        </div>

        <p>If you don't see this email or have any issues, please check your spam folder or contact our support team at support@dust.tt.</p>

        <p>Thank you for your understanding and for being a valued Dust user.</p>`,
      });

      if (emailResult.isErr()) {
        childLogger.error(
          { error: emailResult.error },
          "Failed to send notification email"
        );
        // Don't fail the operation if our notification email fails.
      } else {
        childLogger.info(
          { userId, email },
          "Successfully sent notification email"
        );
      }

      return { success: true };
    } catch (error) {
      childLogger.error({ error }, "Error processing password reset for user");
      return { success: false, error: normalizeError(error).message };
    }
  } else {
    childLogger.info(
      "Would send password reset email via WorkOS and notification email"
    );
    return { success: true };
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

    // Read the CSV file.
    let records: CsvRecord[];
    try {
      records = await readCsvFile(csvPath);
      logger.info(`Read ${records.length} records from CSV file`);
    } catch (error) {
      logger.error({ error, csvPath }, "Failed to read CSV file");
      throw error;
    }

    // Validate the structure of the CSV file.
    if (records.length === 0) {
      throw new Error("CSV file is empty");
    }

    const firstRecord = records[0];
    if (!firstRecord || !("email" in firstRecord)) {
      throw new Error("CSV file must have an 'email' column");
    }

    // Filter out invalid emails.
    const validRecords = records.filter((record) => {
      if (!record.email || typeof record.email !== "string") {
        logger.warn({ record }, "Skipping record with invalid email");
        return false;
      }
      return true;
    });

    logger.info(`Processing ${validRecords.length} valid email records`);

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

    // Summary.
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

    // Log failures.
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
