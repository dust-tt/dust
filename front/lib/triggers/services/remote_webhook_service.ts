import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types";
import type {
  ServiceDataType,
  WebhookSourceKind,
} from "@app/types/triggers/webhooks";

export interface RemoteWebhookService<T extends WebhookSourceKind> {
  getServiceData(
    oauthToken: string
  ): Promise<Result<ServiceDataType<T>, Error>>;

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
