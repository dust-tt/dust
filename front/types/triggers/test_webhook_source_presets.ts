import { RocketIcon } from "@dust-tt/sparkle";

import type { Authenticator } from "@app/lib/auth";
import type { RemoteWebhookService } from "@app/lib/triggers/services/remote_webhook_service";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Ok } from "@app/types";
import type {
  PresetWebhook,
  WebhookEvent,
} from "@app/types/triggers/webhooks_source_preset";

const TEST_EVENT: WebhookEvent = {
  name: "Test event",
  value: "test_event",
  description: "A simple test event with two string fields.",
  fields: [
    {
      name: "A",
      description: "Field A - a string field.",
      type: "string",
    },
    {
      name: "B",
      description: "Field B - a string field.",
      type: "string",
    },
  ],
};

class TestWebhookService implements RemoteWebhookService {
  async createWebhooks(params: {
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
      `Creating webhooks for test preset in workspace ${params.auth.getNonNullableWorkspace().sId}`
    );
    return new Ok({
      updatedRemoteMetadata: {
        ...params.remoteMetadata,
        webhookIds: { test_event: `test-webhook-id-${Date.now()}` },
      },
    });
  }

  async deleteWebhooks(params: {
    auth: Authenticator;
    connectionId: string;
    remoteMetadata: Record<string, any>;
  }): Promise<Result<void, Error>> {
    logger.info(
      `Deleting webhooks for test preset in workspace ${params.auth.getNonNullableWorkspace().sId}`
    );
    return new Ok(undefined);
  }
}

export const TEST_WEBHOOK_PRESET: PresetWebhook = {
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
};
