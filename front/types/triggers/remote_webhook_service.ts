import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types";
import type {
  WebhookProvider,
  WebhookServiceDataForProvider,
} from "@app/types/triggers/webhooks";
import type { WebhookConnectionType } from "@app/types/triggers/webhooks_source_preset";

export interface RemoteWebhookServiceResourceBased<
  P extends WebhookProvider = WebhookProvider,
> {
  getServiceData(
    oauthToken: string
  ): Promise<Result<WebhookServiceDataForProvider<P>, Error>>;

  /**
   * Creates webhooks on the remote service (e.g., GitHub, Jira)
   */
  createWebhooks(params: {
    auth: Authenticator;
    connectionId: string;
    remoteMetadata: Record<string, unknown>;
    webhookUrl: string;
    events: string[];
    secret?: string;
  }): Promise<
    Result<
      {
        updatedRemoteMetadata: Record<string, unknown>;
        errors?: string[];
      },
      Error
    >
  >;

  /**
   * Deletes webhooks from the remote service (e.g., GitHub, Jira)
   */
  deleteWebhooks(params: {
    auth: Authenticator;
    connectionId: string;
    remoteMetadata: Record<string, unknown>;
  }): Promise<Result<void, Error>>;
}

export interface RemoteWebhookServiceAppBased<
  P extends WebhookProvider = WebhookProvider,
> {
  getServiceData(
    oauthToken: string
  ): Promise<Result<WebhookServiceDataForProvider<P>, Error>>;

  getAppWebhookSecret(): Promise<Result<string, Error>>;
}
