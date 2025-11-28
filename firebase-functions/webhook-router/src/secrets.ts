import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

import { CONFIG, getProjectIds } from "./config.js";

export interface Secrets {
  euSecret: string;
  slackSigningSecret: string;
  usSecret: string;
  webhookSecret: string;
  microsoftBotId?: string;
  notionSigningSecret: string;
}

export class SecretManager {
  private client = new SecretManagerServiceClient();
  private secrets: Secrets | null = null;
  private initPromise: Promise<Secrets> | null = null;

  dispose(): void {
    // Clean up the client connection.
    void this.client.close();
  }

  async getSecrets(): Promise<Secrets> {
    if (this.secrets) {
      return this.secrets;
    }

    if (!this.initPromise) {
      this.initPromise = this.loadSecrets();
    }

    this.secrets = await this.initPromise;
    return this.secrets;
  }

  private async loadSecrets(): Promise<Secrets> {
    // Try local development environment variables first.
    if (CONFIG.DUST_CONNECTORS_WEBHOOKS_SECRET) {
      console.log("Using secrets from environment variables", {
        component: "secrets",
        source: "environment",
      });
      return {
        euSecret: CONFIG.DUST_CONNECTORS_WEBHOOKS_SECRET,
        microsoftBotId: CONFIG.MICROSOFT_BOT_ID_SECRET,
        slackSigningSecret: CONFIG.SLACK_SIGNING_SECRET ?? "",
        notionSigningSecret: CONFIG.NOTION_SIGNING_SECRET ?? "",
        usSecret: CONFIG.DUST_CONNECTORS_WEBHOOKS_SECRET,
        webhookSecret: CONFIG.DUST_CONNECTORS_WEBHOOKS_SECRET,
      };
    }

    // Load from Secret Manager.
    console.log("Loading secrets from Secret Manager", {
      component: "secrets",
      source: "secret-manager",
    });
    return this.loadFromSecretManager();
  }

  private async loadFromSecretManager(): Promise<Secrets> {
    const { GCP_GLOBAL_PROJECT_ID, GCP_US_PROJECT_ID, GCP_EU_PROJECT_ID } =
      getProjectIds();

    if (!GCP_GLOBAL_PROJECT_ID || !GCP_US_PROJECT_ID || !GCP_EU_PROJECT_ID) {
      throw new Error("Missing required project environment variables");
    }

    try {
      const [
        webhookSecretResponse,
        usSecretResponse,
        euSecretResponse,
        slackSigningSecretResponse,
        microsoftBotIdResponse,
        notionSigningSecretResponse,
      ] = await Promise.all([
        this.client.accessSecretVersion({
          name: `projects/${GCP_GLOBAL_PROJECT_ID}/secrets/${CONFIG.SECRET_NAME}/versions/latest`,
        }),
        this.client.accessSecretVersion({
          name: `projects/${GCP_US_PROJECT_ID}/secrets/${CONFIG.SECRET_NAME}/versions/latest`,
        }),
        this.client.accessSecretVersion({
          name: `projects/${GCP_EU_PROJECT_ID}/secrets/${CONFIG.SECRET_NAME}/versions/latest`,
        }),
        this.client.accessSecretVersion({
          name: `projects/${GCP_GLOBAL_PROJECT_ID}/secrets/${CONFIG.SLACK_SIGNING_SECRET_NAME}/versions/latest`,
        }),
        this.client.accessSecretVersion({
          name: `projects/${GCP_GLOBAL_PROJECT_ID}/secrets/${CONFIG.MICROSOFT_BOT_ID_SECRET_NAME}/versions/latest`,
        }),
        this.client.accessSecretVersion({
          name: `projects/${GCP_GLOBAL_PROJECT_ID}/secrets/${CONFIG.NOTION_SIGNING_SECRET_NAME}/versions/latest`,
        }),
      ]);

      return {
        webhookSecret: webhookSecretResponse[0].payload?.data?.toString() || "",
        microsoftBotId:
          microsoftBotIdResponse[0].payload?.data?.toString() || "",
        usSecret: usSecretResponse[0].payload?.data?.toString() || "",
        euSecret: euSecretResponse[0].payload?.data?.toString() || "",
        slackSigningSecret:
          slackSigningSecretResponse[0].payload?.data?.toString() || "",
        notionSigningSecret:
          notionSigningSecretResponse[0].payload?.data?.toString() || "",
      };
    } catch (error) {
      console.error("Failed to load secrets from Secret Manager", {
        component: "secrets",
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error("Unable to load required secrets");
    }
  }
}
