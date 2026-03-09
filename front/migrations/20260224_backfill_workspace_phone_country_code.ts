import { createHash } from "crypto";
import { createReadStream } from "fs";
import { createInterface } from "readline";

import { WorkspaceVerificationAttemptModel } from "@app/lib/resources/storage/models/workspace_verification_attempt";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeScript } from "@app/scripts/helpers";
import { Op } from "sequelize";

interface CsvEntry {
  status: string;
  country: string;
  sentTo: string;
}

async function parseCsv(filePath: string): Promise<CsvEntry[]> {
  const entries: CsvEntry[] = [];

  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let isFirstLine = true;
  let statusIndex = -1;
  let countryIndex = -1;
  let sentToIndex = -1;

  for await (const line of rl) {
    const columns = line.split(",");

    if (isFirstLine) {
      statusIndex = columns.indexOf("status");
      countryIndex = columns.indexOf("country");
      sentToIndex = columns.indexOf("sent_to");

      if (statusIndex === -1 || countryIndex === -1 || sentToIndex === -1) {
        throw new Error(
          `Missing required columns. Found: ${columns.join(", ")}`
        );
      }
      isFirstLine = false;
      continue;
    }

    entries.push({
      status: columns[statusIndex],
      country: columns[countryIndex],
      sentTo: columns[sentToIndex],
    });
  }

  return entries;
}

function hashPhoneNumber(phoneNumber: string): string {
  return createHash("sha256").update(phoneNumber).digest("hex");
}

makeScript(
  {
    csvPath: {
      type: "string",
      required: true,
      description: "Path to the Twilio verification logs CSV file",
    },
  },
  async ({ execute, csvPath }, logger) => {
    const VerificationAttemptModelWithBypass: ModelStaticWorkspaceAware<WorkspaceVerificationAttemptModel> =
      WorkspaceVerificationAttemptModel;

    const entries = await parseCsv(csvPath);
    logger.info({ totalEntries: entries.length }, "Parsed CSV file");

    let processed = 0;
    let matched = 0;
    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    for (const entry of entries) {
      processed++;
      const phoneHash = hashPhoneNumber(entry.sentTo);

      const attempt = await VerificationAttemptModelWithBypass.findOne({
        where: { phoneNumberHash: phoneHash, verifiedAt: { [Op.ne]: null } },
        // WORKSPACE_ISOLATION_BYPASS: Migration script needs to query all verification attempts globally.
        dangerouslyBypassWorkspaceIsolationSecurity: true,
      });

      if (!attempt) {
        logger.info(
          {
            phoneNumber: entry.sentTo.slice(0, 6) + "...",
            phoneHash: phoneHash.slice(0, 12) + "...",
            csvStatus: entry.status,
            csvCountry: entry.country,
            result: "no_verification_attempt_found",
          },
          "No matching verification attempt"
        );
        notFound++;
        continue;
      }

      matched++;
      const workspace = await WorkspaceModel.findByPk(attempt.workspaceId);
      if (!workspace) {
        logger.warn(
          {
            workspaceId: attempt.workspaceId,
            phoneHash: phoneHash.slice(0, 12) + "...",
            result: "workspace_not_found",
          },
          "Workspace not found for verification attempt"
        );
        notFound++;
        continue;
      }

      const existingMetadata = workspace.metadata ?? {};
      const existingCountry = workspace.metadata?.phoneCountry;

      if (existingCountry !== undefined) {
        logger.info(
          {
            workspaceSId: workspace.sId,
            existingCountry,
            csvCountry: entry.country,
            result: "skipped_already_has_country",
          },
          "Skipping - workspace already has phoneCountry"
        );
        skipped++;
        continue;
      }

      logger.info(
        {
          workspaceSId: workspace.sId,
          workspaceName: workspace.name,
          csvCountry: entry.country,
          csvStatus: entry.status,
          currentMetadata: workspace.metadata,
          result: execute ? "updating" : "would_update",
        },
        execute ? "Updating workspace" : "Would update workspace"
      );

      if (execute) {
        const newMetadata = {
          ...existingMetadata,
          phoneCountry: entry.country,
        };
        await workspace.update({ metadata: newMetadata });
      }
      updated++;
    }

    logger.info(
      {
        processed,
        matched,
        updated,
        skipped,
        notFound,
        execute,
      },
      "Migration complete"
    );
  }
);
