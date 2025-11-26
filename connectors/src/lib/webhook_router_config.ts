import { Storage } from "@google-cloud/storage";

import { connectorsConfig } from "@connectors/connectors/shared/config";
import logger from "@connectors/logger/logger";
import { isDevelopment } from "@connectors/types";

const WEBHOOK_ROUTER_CONFIG_FILE = "webhook-router-config.json";

export interface WebhookRouterEntry {
  signing_secret: string;
  regions: string[];
}

export interface WebhookRouterConfig {
  [provider: string]: {
    [appId: string]: WebhookRouterEntry;
  };
}

/**
 * Error thrown when a webhook router entry is not found.
 */
export class WebhookRouterEntryNotFoundError extends Error {
  constructor(
    public readonly provider: string,
    public readonly appId: string
  ) {
    super(
      `Webhook router entry not found for provider '${provider}' and appId '${appId}'`
    );
    this.name = "WebhookRouterEntryNotFoundError";
  }
}

/**
 * Error thrown when a concurrent modification is detected during a write operation.
 */
export class ConcurrentModificationError extends Error {
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

  constructor(bucketName?: string) {
    this.storage = new Storage({
      keyFilename: isDevelopment()
        ? connectorsConfig.getServiceAccount()
        : undefined,
    });
    this.bucketName =
      bucketName || connectorsConfig.getWebhookRouterConfigBucket();
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

      const config = JSON.parse(contents.toString("utf-8"));

      // Validate the structure
      if (typeof config !== "object" || config === null) {
        throw new Error(
          "Invalid webhook router configuration format. Expected an object."
        );
      }

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
   * @param appId - The application/team ID for logging
   * @param maxRetries - Maximum number of retries on concurrent modification (default: 5)
   */
  private async executeWithRetry(
    operation: (
      config: WebhookRouterConfig,
      generation: string | null
    ) => Promise<WebhookRouterConfig>,
    operationName: string,
    provider: string,
    appId: string,
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
          { provider, appId },
          `Successfully ${operationName} webhook router entry`
        );
        return;
      } catch (error) {
        if (
          error instanceof ConcurrentModificationError &&
          attempt < maxRetries
        ) {
          logger.info(
            { provider, appId, attempt: attempt + 1, maxRetries },
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
   * Add or update a webhook router entry with retry logic for concurrent modifications.
   *
   * @param provider - The provider name (e.g., "slack", "notion")
   * @param appId - The application/team ID
   * @param entry - The entry configuration
   * @param maxRetries - Maximum number of retries on concurrent modification (default: 5)
   */
  async addEntry(
    provider: string,
    appId: string,
    entry: WebhookRouterEntry,
    maxRetries: number = 5
  ): Promise<void> {
    return this.executeWithRetry(
      async (config) => {
        // Update config
        if (!config[provider]) {
          config[provider] = {};
        }
        config[provider][appId] = entry;
        return config;
      },
      "add",
      provider,
      appId,
      maxRetries
    );
  }

  /**
   * Delete a webhook router entry with retry logic for concurrent modifications.
   *
   * @param provider - The provider name
   * @param appId - The application/team ID
   * @param maxRetries - Maximum number of retries on concurrent modification (default: 5)
   */
  async deleteEntry(
    provider: string,
    appId: string,
    maxRetries: number = 5
  ): Promise<void> {
    return this.executeWithRetry(
      async (config) => {
        // Check if entry exists
        if (!config[provider] || !config[provider]?.[appId]) {
          throw new Error(
            `Webhook router entry not found for provider '${provider}' and appId '${appId}'`
          );
        }

        // Delete the entry
        delete config[provider][appId];

        // Clean up empty provider object
        if (Object.keys(config[provider]).length === 0) {
          delete config[provider];
        }

        return config;
      },
      "delete",
      provider,
      appId,
      maxRetries
    );
  }
}
