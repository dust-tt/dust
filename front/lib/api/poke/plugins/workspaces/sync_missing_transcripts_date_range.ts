import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { processTranscriptActivity } from "@app/temporal/labs/transcripts/activities";
import { scanModjoTranscriptsInDateRange } from "@app/temporal/labs/transcripts/utils/modjo";
import { Err, isModjoCredentials, OAuthAPI, Ok } from "@app/types";

export const syncMissingTranscriptsDateRangePlugin = createPlugin({
  manifest: {
    id: "sync-missing-transcripts-date-range",
    name: "Sync Missing Modjo Transcripts for Date Range",
    description:
      "Scan Modjo API for transcripts in a specific date range, check them against the database, and sync any missing ones to Dust. Optionally force resync all transcripts. Modjo only.",
    resourceTypes: ["workspaces"],
    args: {
      transcriptsConfigurationId: {
        type: "enum",
        label: "Modjo Transcripts Configuration",
        description: "Select the Modjo transcripts configuration to scan",
        async: true,
        multiple: false,
        values: [],
      },
      startDate: {
        type: "string",
        label: "Start Date (YYYY-MM-DD)",
        description:
          "Modjo start date for the range to scan (inclusive). Format: YYYY-MM-DD",
      },
      endDate: {
        type: "string",
        label: "End Date (YYYY-MM-DD)",
        description:
          "Modjo end date for the range to scan (inclusive). Format: YYYY-MM-DD. Leave empty to use today.",
      },
      forceResync: {
        type: "boolean",
        label: "Force Resync",
        description:
          "If enabled, resync all transcripts even if they are already in the database",
      },
    },
  },
  populateAsyncArgs: async (auth) => {
    const workspace = auth.getNonNullableWorkspace();
    const configurations =
      await LabsTranscriptsConfigurationResource.findByWorkspaceId(
        workspace.id
      );

    // Filter to only Modjo configurations
    const modjoConfigurations = configurations.filter(
      (config) => config.provider === "modjo"
    );

    // Build enum values with detailed information
    const options = await concurrentExecutor(
      modjoConfigurations,
      async (config) => {
        const hasHistory = await config.hasAnyHistory();
        const mostRecentDate = await config.getMostRecentHistoryDate(auth);
        const user = await config.getUser();

        const statusParts = [];
        statusParts.push(`ID: ${config.id.toString()}`);
        statusParts.push(`User: ${user?.email ?? "Unknown"}`);
        statusParts.push(config.isActive ? "Active" : "Inactive");
        if (hasHistory) {
          statusParts.push(
            `Last sync: ${mostRecentDate ? mostRecentDate.toISOString().split("T")[0] : "Unknown"}`
          );
        } else {
          statusParts.push("No history");
        }

        return {
          label: `[${config.provider}] ${statusParts.join(" | ")}`,
          value: config.sId,
        };
      },
      { concurrency: 8 }
    );

    return new Ok({
      transcriptsConfigurationId: options,
    });
  },
  execute: async (auth, _, args) => {
    const workspace = auth.getNonNullableWorkspace();
    const configurationId = args.transcriptsConfigurationId[0];

    if (!configurationId.trim()) {
      return new Err(new Error("No transcripts configuration selected"));
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(args.startDate)) {
      return new Err(
        new Error(
          "Invalid start date format. Use YYYY-MM-DD (e.g., 2024-01-15)"
        )
      );
    }

    const endDate = args.endDate || new Date().toISOString().split("T")[0];
    if (!dateRegex.test(endDate)) {
      return new Err(
        new Error("Invalid end date format. Use YYYY-MM-DD (e.g., 2024-01-15)")
      );
    }

    // Parse dates
    const startDateTime = new Date(args.startDate + "T00:00:00Z");
    const endDateTime = new Date(endDate + "T23:59:59Z");

    if (isNaN(startDateTime.getTime())) {
      return new Err(new Error("Invalid start date"));
    }
    if (isNaN(endDateTime.getTime())) {
      return new Err(new Error("Invalid end date"));
    }
    if (startDateTime > endDateTime) {
      return new Err(
        new Error("Start date must be before or equal to end date")
      );
    }

    const configuration = await LabsTranscriptsConfigurationResource.fetchById(
      auth,
      configurationId
    );

    if (!configuration) {
      return new Err(
        new Error(
          `Could not find transcripts configuration with id ${configurationId}`
        )
      );
    }

    if (configuration.workspaceId !== workspace.id) {
      return new Err(
        new Error("Configuration does not belong to this workspace")
      );
    }

    if (configuration.provider !== "modjo") {
      return new Err(
        new Error(
          "This plugin only works with Modjo configurations. Selected configuration is for: " +
            configuration.provider
        )
      );
    }

    if (!configuration.credentialId) {
      return new Err(new Error("No credentials found for Modjo configuration"));
    }

    // Get Modjo API key
    const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
    const modjoApiKeyRes = await oauthApi.getCredentials({
      credentialsId: configuration.credentialId,
    });

    if (modjoApiKeyRes.isErr()) {
      return new Err(
        new Error(
          `Error fetching Modjo API credentials: ${modjoApiKeyRes.error.message}`
        )
      );
    }

    if (!isModjoCredentials(modjoApiKeyRes.value.credential.content)) {
      return new Err(
        new Error("Invalid credentials type - expected Modjo credentials")
      );
    }

    const modjoApiKey = modjoApiKeyRes.value.credential.content.api_key;

    // Scan Modjo API for transcripts in the date range
    let foundTranscriptsFromModjo: Array<{
      callId: string;
      title: string;
      startDate: string;
    }> = [];

    const localLogger = logger.child({
      configurationId: configuration.id,
      startDate: args.startDate,
      endDate,
    });

    try {
      foundTranscriptsFromModjo = await scanModjoTranscriptsInDateRange(
        modjoApiKey,
        startDateTime,
        endDateTime,
        localLogger
      );
    } catch (error) {
      return new Err(
        new Error(
          `Error scanning Modjo API: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }

    // Check which transcripts are already in the database
    const missingTranscripts: Array<{
      callId: string;
      title: string;
      startDate: string;
    }> = [];
    const alreadyInDb: Array<{
      callId: string;
      title: string;
    }> = [];

    const forceResync = args.forceResync ?? false;

    for (const transcript of foundTranscriptsFromModjo) {
      const history = await configuration.fetchHistoryForFileId(
        auth,
        transcript.callId
      );

      if (!history || forceResync) {
        missingTranscripts.push(transcript);
      }

      if (history) {
        alreadyInDb.push({
          callId: transcript.callId,
          title: transcript.title,
        });
      }
    }

    logger.info(
      {
        configurationId: configuration.id,
        totalFound: foundTranscriptsFromModjo.length,
        alreadyInDb: alreadyInDb.length,
        missing: missingTranscripts.length,
        forceResync,
      },
      "[syncMissingTranscriptsDateRangePlugin] Checked database for existing transcripts"
    );

    // Sync missing transcripts
    if (missingTranscripts.length === 0) {
      return new Ok({
        display: "json",
        value: {
          message: forceResync
            ? `Force resync enabled but no transcripts found in date range.`
            : `All ${foundTranscriptsFromModjo.length} transcripts from Modjo are already synced to Dust.`,
          dateRange: {
            start: args.startDate,
            end: endDate,
          },
          totalFound: foundTranscriptsFromModjo.length,
          alreadyInDb: alreadyInDb.length,
          synced: 0,
          forceResync,
          alreadySyncedSample: alreadyInDb.slice(0, 10),
        },
      });
    }

    // Process missing transcripts using the existing activity
    const syncResults = await concurrentExecutor(
      missingTranscripts,
      async (transcript) => {
        try {
          // If force resync is enabled, delete the existing history record first
          if (forceResync) {
            const deleteRes = await configuration.deleteHistoryByFileId(
              auth,
              transcript.callId
            );
            if (deleteRes.isErr()) {
              localLogger.warn(
                {
                  callId: transcript.callId,
                  error: deleteRes.error.message,
                },
                "[syncMissingTranscriptsDateRangePlugin] Failed to delete existing history for force resync"
              );
            }
          }

          await processTranscriptActivity({
            fileId: transcript.callId,
            transcriptsConfigurationId: configuration.sId,
            workspaceId: workspace.sId,
          });

          return {
            success: true,
            callId: transcript.callId,
            title: transcript.title,
            startDate: transcript.startDate,
          };
        } catch (error) {
          return {
            success: false,
            callId: transcript.callId,
            title: transcript.title,
            startDate: transcript.startDate,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
      { concurrency: 5 }
    );

    const successCount = syncResults.filter((r) => r.success).length;
    const failedCount = syncResults.filter((r) => !r.success).length;
    const failedTranscripts = syncResults.filter((r) => !r.success);

    return new Ok({
      display: "json",
      value: {
        message: forceResync
          ? `Force resync: Found ${foundTranscriptsFromModjo.length} transcripts in Modjo (${alreadyInDb.length} were already in DB). Resynced ${successCount} transcripts${failedCount > 0 ? `, ${failedCount} failed` : ""}.`
          : `Found ${foundTranscriptsFromModjo.length} transcripts in Modjo. ${alreadyInDb.length} already in DB. Synced ${successCount} new transcripts${failedCount > 0 ? `, ${failedCount} failed` : ""}.`,
        dateRange: {
          start: args.startDate,
          end: endDate,
        },
        totalFoundInModjo: foundTranscriptsFromModjo.length,
        alreadyInDb: alreadyInDb.length,
        newlySynced: successCount,
        failed: failedCount,
        forceResync,
        ...(failedCount > 0 && { failedTranscripts }),
        syncedTranscripts: syncResults.filter((r) => r.success),
      },
    });
  },
});
