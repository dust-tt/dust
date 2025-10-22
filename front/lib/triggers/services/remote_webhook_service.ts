import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types";

export interface RemoteWebhookService {
  /**
   * Creates webhooks on the remote service (e.g., GitHub, Jira)
   */
  createWebhooks(params: {
    auth: Authenticator;
    connectionId: string;
    remoteMetadata: Record<string, any>;
    webhookUrl: string;
    events: string[];
    secret?: string;
  }): Promise<
    Result<
      {
        updatedRemoteMetadata: Record<string, any>;
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
    remoteMetadata: Record<string, any>;
  }): Promise<Result<void, Error>>;
}
