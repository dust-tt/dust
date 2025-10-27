import { RocketIcon } from "@dust-tt/sparkle";

import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Ok } from "@app/types";
import type { RemoteWebhookService } from "@app/types/triggers/remote_webhook_service";
import type {
  PresetWebhook,
  WebhookEvent,
} from "@app/types/triggers/webhooks_source_preset";

export type TestServiceData = Record<string, unknown>;

const TEST_EVENT: WebhookEvent = {
  name: "Test event",
  value: "test_event",
  description: "A simple test event with two string fields.",
  schema: {
    type: "object",
    properties: {
      A: {
        type: "string",
        description: "Field A - a string field.",
      },
      B: {
        type: "string",
        description: "Field B - a string field.",
      },
    },
    required: ["A", "B"],
    additionalProperties: false,
  },
};

class TestWebhookService implements RemoteWebhookService<"test"> {
  async getServiceData(
    oauthToken: string
  ): Promise<Result<TestServiceData, Error>> {
    logger.info("Fetching service data with oauthToken:", oauthToken);
    return new Ok({
      info: "This is test service data",
      timestamp: Date.now(),
    });
  }

  async createWebhooks({
    auth,
    connectionId: _connectionId,
    remoteMetadata,
    webhookUrl: _webhookUrl,
    events: _events,
    secret: _secret,
  }: {
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
  > {
    logger.info(
      { workspaceId: auth.getNonNullableWorkspace().sId },
      `Creating webhooks for test preset`
    );
    return new Ok({
      updatedRemoteMetadata: {
        ...remoteMetadata,
        webhookIds: { test_event: `test-webhook-id-${Date.now()}` },
      },
    });
  }

  async deleteWebhooks({
    auth,
    connectionId: _connectionId,
    remoteMetadata: _remoteMetadata,
  }: {
    auth: Authenticator;
    connectionId: string;
    remoteMetadata: Record<string, any>;
  }): Promise<Result<void, Error>> {
    logger.info(
      { workspaceId: auth.getNonNullableWorkspace().sId },
      `Deleting webhooks for test preset`
    );
    return new Ok(undefined);
  }
}

export const TEST_WEBHOOK_PRESET: PresetWebhook<"test"> = {
  name: "Test",
  eventCheck: {
    type: "headers",
    field: "event-type",
  },
  events: [TEST_EVENT],
  icon: RocketIcon,
  description: "A test webhook preset with a simple event structure.",
  // Used for dev tests only, it should always be hidden behind the flag
  featureFlag: "hootl_dev_webhooks",
  // inline dummy service for test purposes
  webhookService: new TestWebhookService(),
  components: {
    detailsComponent: () => null,
    createFormComponent: () => null,
  },
};
