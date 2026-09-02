import {
  type CellType,
  connectorsConfig,
  SUPPORTED_CELLS,
} from "@connectors/connectors/shared/config";
import logger from "@connectors/logger/logger";
import { isDevelopment } from "@connectors/types";
import { Storage } from "@google-cloud/storage";
import { z } from "zod";

const WEBHOOK_ROUTER_CONFIG_FILE = "webhook-router-config.json";

const WebhookRouterEntryBaseSchema = z.object({
  signingSecret: z.string(),
  cells: z.record(z.enum(SUPPORTED_CELLS), z.array(z.number())),
});

// Preserve legacy keys (e.g. `regions`) across read-modify-write cycles until
// they are intentionally removed by the removeRegions backfill.
const WebhookRouterEntrySchema = WebhookRouterEntryBaseSchema.passthrough();

const WebhookRouterConfigSchema = z.record(
  z.enum(["slack", "notion"]),
  z.record(z.string(), WebhookRouterEntrySchema)
);

const WebhookRouterConfigWithoutLegacyKeysSchema = z.record(
  z.enum(["slack", "notion"]),
  z.record(z.string(), WebhookRouterEntryBaseSchema)
);

type WebhookRouterEntry = z.infer<typeof WebhookRouterEntryBaseSchema>;
type WebhookRouterConfig = z.infer<typeof WebhookRouterConfigSchema>;

/**
 * Error thrown when a concurrent modification is detected during a write operation.
 */
class ConcurrentModificationError extends Error {
  constructor(message: string = "Concurrent modification detected") {
    super(message);
    this.name = "ConcurrentModificationError";
  }
}

/**
 * Service for managing webhook router configuration in GCS.
 * Handles concurrent writes using GCS preconditions with generation numbers.
 */
export class WebhookRouterConfigService {
  private storage: Storage;
  private bucketName: string;

  constructor() {
    this.storage = new Storage({
      // Use local firebase emulator in development mode. The port matches what we have in
      // firebase.json
      apiEndpoint: isDevelopment() ? "http://localhost:9199" : undefined,
      keyFilename: isDevelopment()
        ? connectorsConfig.getServiceAccount()
        : undefined,
    });
    this.bucketName = connectorsConfig.getWebhookRouterConfigBucket();
  }

  /**
   * Read the current webhook router configuration from GCS.
   * Returns both the config and the generation number for optimistic locking.
   */
  async readConfig(): Promise<{
    config: WebhookRouterConfig;
    generation: string | null;
  }> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(WEBHOOK_ROUTER_CONFIG_FILE);

    try {
      const [exists] = await file.exists();

      if (!exists) {
        // File doesn't exist yet, return empty config
        logger.info(
          { bucketName: this.bucketName },
          "Webhook router config file does not exist, returning empty config"
        );
        return { config: {}, generation: null };
      }

      const [contents] = await file.download();
      const [metadata] = await file.getMetadata();

      const parsed = JSON.parse(contents.toString("utf-8"));
      const config = WebhookRouterConfigSchema.parse(parsed);

      return {
        config,
        generation: metadata.generation?.toString() || null,
      };
    } catch (error) {
      logger.error(
        { error, bucketName: this.bucketName },
        "Failed to read webhook router config from GCS"
      );
      throw error;
    }
  }

  /**
   * Write the webhook router configuration to GCS with optimistic locking.
   * Uses GCS preconditions to ensure atomic updates and prevent concurrent writes.
   *
   * @param config - The configuration to write
   * @param expectedGeneration - The generation number we expect the file to have.
   *                            If null, the file must not exist.
   *                            If provided, the file must have this exact generation.
   * @throws Error if the precondition fails (concurrent modification detected)
   */
  async writeConfig(
    config: WebhookRouterConfig,
    expectedGeneration: string | null
  ): Promise<void> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(WEBHOOK_ROUTER_CONFIG_FILE);

    try {
      const content = JSON.stringify(config, null, 2);

      // Set up preconditions for atomic update
      const saveOptions: {
        metadata: { contentType: string };
        preconditionOpts?: { ifGenerationMatch: number | string };
      } = {
        metadata: {
          contentType: "application/json",
        },
      };

      if (expectedGeneration === null) {
        // File should not exist - this is the initial write
        saveOptions.preconditionOpts = { ifGenerationMatch: 0 };
      } else {
        // File should exist with the expected generation
        saveOptions.preconditionOpts = {
          ifGenerationMatch: expectedGeneration,
        };
      }

      await file.save(content, saveOptions);

      logger.info(
        {
          bucketName: this.bucketName,
          expectedGeneration,
        },
        "Successfully wrote webhook router config to GCS"
      );
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === 412) {
        // Precondition failed - concurrent modification detected
        logger.warn(
          {
            bucketName: this.bucketName,
            expectedGeneration,
            error: error.message,
          },
          "Precondition failed: concurrent modification detected"
        );
        throw new ConcurrentModificationError();
      }

      logger.error(
        { error, bucketName: this.bucketName },
        "Failed to write webhook router config to GCS"
      );
      throw error;
    }
  }

  /**
   * Executes a config operation with retry logic for concurrent modifications.
   * Handles read-modify-write cycles with optimistic locking.
   *
   * @param operation - Function that takes config and generation, modifies config, and returns it
   * @param operationName - Name of the operation for logging (e.g., "add", "delete")
   * @param provider - The provider name for logging
   * @param providerWorkspaceId - The provider workspace/team ID for logging
   * @param maxRetries - Maximum number of retries on concurrent modification (default: 5)
   */
  private async executeWithRetry(
    operation: (
      config: WebhookRouterConfig,
      generation: string | null
    ) => Promise<WebhookRouterConfig>,
    operationName: string,
    provider: string,
    providerWorkspaceId: string,
    maxRetries: number = 5
  ): Promise<void> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Read current config with generation
        const { config, generation } = await this.readConfig();

        // Execute the operation to modify config
        const updatedConfig = await operation(config, generation);

        // Write back with precondition
        await this.writeConfig(updatedConfig, generation);

        logger.info(
          { provider, providerWorkspaceId },
          `Successfully ${operationName} webhook router entry`
        );
        return;
      } catch (error) {
        if (
          error instanceof ConcurrentModificationError &&
          attempt < maxRetries
        ) {
          logger.info(
            {
              provider,
              providerWorkspaceId,
              attempt: attempt + 1,
              maxRetries,
            },
            `Retrying ${operationName} operation due to concurrent modification`
          );
          // Brief exponential backoff before retry
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 100)
          );
          continue;
        }
        throw error;
      }
    }

    throw new Error(
      `Failed to ${operationName} entry after ${maxRetries} retries due to concurrent modifications`
    );
  }

  /**
   * Sync webhook router entry for a specific cell with retry logic for concurrent modifications.
   * Updates the connector IDs for the given cell. If connectorIds is empty, removes the cell.
   * If all cells are removed, deletes the entire entry.
   *
   * @param provider - The provider name (e.g., "slack", "notion")
   * @param providerWorkspaceId - The provider workspace/team ID
   * @param signingSecret - Optional signing secret for verification. If provided, updates the secret.
   * @param cell - The cell name (e.g., "cell-00000", "cell-00001")
   * @param connectorIds - Array of connector IDs for this cell
   * @param maxRetries - Maximum number of retries on concurrent modification (default: 5)
   */
  async syncEntry(
    provider: "slack" | "notion",
    providerWorkspaceId: string,
    signingSecret: string | undefined,
    cell: CellType,
    connectorIds: number[],
    maxRetries: number = 5
  ): Promise<void> {
    return this.executeWithRetry(
      async (config) => {
        // Initialize provider object if it doesn't exist
        if (!config[provider]) {
          config[provider] = {};
        }

        // Get existing entry if any
        const existingEntry = config[provider]![providerWorkspaceId];

        if (connectorIds.length === 0) {
          // No connectors for this cell - remove the cell
          if (existingEntry) {
            delete existingEntry.cells[cell];

            // If no cells left, delete the entire entry
            if (Object.keys(existingEntry.cells).length === 0) {
              delete config[provider]![providerWorkspaceId];
            }
          }
        } else {
          // We have connectors - update or create the entry
          if (existingEntry) {
            // Update existing entry
            if (signingSecret !== undefined) {
              existingEntry.signingSecret = signingSecret;
            }
            existingEntry.cells = {
              ...existingEntry.cells,
              [cell]: connectorIds,
            };
          } else {
            // Create new entry - signingSecret must be provided for new entries
            if (!signingSecret) {
              throw new Error(
                `Cannot create new entry without signing secret for provider '${provider}' and providerWorkspaceId '${providerWorkspaceId}'`
              );
            }
            config[provider]![providerWorkspaceId] = {
              signingSecret,
              cells: {
                [cell]: connectorIds,
              },
            };
          }
        }

        return config;
      },
      "sync",
      provider,
      providerWorkspaceId,
      maxRetries
    );
  }

  /**
   * Get a webhook router entry.
   *
   * @param provider - The provider name
   * @param providerWorkspaceId - The provider workspace/team ID
   * @returns The entry if found, null otherwise
   */
  async getEntry(
    provider: "slack" | "notion",
    providerWorkspaceId: string
  ): Promise<WebhookRouterEntry | null> {
    const { config } = await this.readConfig();
    return config[provider]?.[providerWorkspaceId] || null;
  }

  /**
   * Remove legacy `regions` fields from webhook router entries in GCS.
   * Uses a stripping schema so unknown keys are dropped from the rewritten file.
   */
  async removeRegions(execute: boolean): Promise<{ entriesUpdated: number }> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(WEBHOOK_ROUTER_CONFIG_FILE);
    const [exists] = await file.exists();

    if (!exists) {
      return { entriesUpdated: 0 };
    }

    const [contents] = await file.download();
    const [metadata] = await file.getMetadata();
    const raw = JSON.parse(contents.toString("utf-8"));

    let entriesUpdated = 0;
    if (typeof raw === "object" && raw !== null) {
      for (const providerConfig of Object.values(raw)) {
        if (typeof providerConfig !== "object" || providerConfig === null) {
          continue;
        }
        for (const entry of Object.values(providerConfig)) {
          if (
            typeof entry === "object" &&
            entry !== null &&
            "regions" in entry
          ) {
            entriesUpdated++;
          }
        }
      }
    }

    if (entriesUpdated === 0) {
      return { entriesUpdated: 0 };
    }

    const config = WebhookRouterConfigWithoutLegacyKeysSchema.parse(raw);

    if (execute) {
      await this.writeConfig(config, metadata.generation?.toString() || null);
    }

    return { entriesUpdated };
  }
}
