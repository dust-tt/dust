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
    [providerWorkspaceId: string]: WebhookRouterEntry;
  };
}

/**
 * Error thrown when a webhook router entry is not found.
 */
export class WebhookRouterEntryNotFoundError extends Error {
  constructor(
    public readonly provider: string,
    public readonly providerWorkspaceId: string
  ) {
    super(
      `Webhook router entry not found for provider '${provider}' and providerWorkspaceId '${providerWorkspaceId}'`
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
 * Error thrown when attempting to merge with a different signing secret.
 */
export class SigningSecretMismatchError extends Error {
  constructor(
    public readonly provider: string,
    public readonly appId: string
  ) {
    super(
      `Cannot merge webhook router entry: signing secret does not match existing entry for provider '${provider}' and appId '${appId}'`
    );
    this.name = "SigningSecretMismatchError";
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
   * Add or update a webhook router entry with retry logic for concurrent modifications.
   *
   * @param provider - The provider name (e.g., "slack", "notion")
   * @param providerWorkspaceId - The provider workspace/team ID
   * @param entry - The entry configuration
   * @param options - Optional configuration
   * @param options.merge - If true, merge regions with existing entry. If false, replace entire entry (default: false)
   * @param options.maxRetries - Maximum number of retries on concurrent modification (default: 5)
   */
  async addEntry(
    provider: string,
    providerWorkspaceId: string,
    entry: WebhookRouterEntry,
    options: { merge?: boolean; maxRetries?: number } = {}
  ): Promise<void> {
    const { merge = false, maxRetries = 5 } = options;

    return this.executeWithRetry(
      async (config) => {
        // Initialize provider object if it doesn't exist
        if (!config[provider]) {
          config[provider] = {};
        }

        // Get existing entry if any
        const existingEntry = config[provider]![providerWorkspaceId];

        if (merge && existingEntry) {
          // Validate signing secret matches when merging
          if (existingEntry.signing_secret !== entry.signing_secret) {
            throw new SigningSecretMismatchError(provider, providerWorkspaceId);
          }

          // Merge regions: combine existing and new regions, removing duplicates
          const mergedRegions = Array.from(
            new Set([...existingEntry.regions, ...entry.regions])
          );

          config[provider]![providerWorkspaceId] = {
            signing_secret: entry.signing_secret,
            regions: mergedRegions,
          };
        } else {
          // Replace entire entry (POST behavior or PATCH when entry doesn't exist)
          config[provider]![providerWorkspaceId] = entry;
        }

        return config;
      },
      merge ? "merge" : "add",
      provider,
      providerWorkspaceId,
      maxRetries
    );
  }

  /**
   * Delete a webhook router entry with retry logic for concurrent modifications.
   *
   * @param provider - The provider name
   * @param providerWorkspaceId - The provider workspace/team ID
   * @param maxRetries - Maximum number of retries on concurrent modification (default: 5)
   */
  async deleteEntry(
    provider: string,
    providerWorkspaceId: string,
    maxRetries: number = 5
  ): Promise<void> {
    return this.executeWithRetry(
      async (config) => {
        // Check if entry exists
        if (!config[provider] || !config[provider]?.[providerWorkspaceId]) {
          throw new WebhookRouterEntryNotFoundError(
            provider,
            providerWorkspaceId
          );
        }

        // Delete the entry
        delete config[provider]![providerWorkspaceId];

        return config;
      },
      "delete",
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
    provider: string,
    providerWorkspaceId: string
  ): Promise<WebhookRouterEntry | null> {
    const { config } = await this.readConfig();
    return config[provider]?.[providerWorkspaceId] || null;
  }
}
