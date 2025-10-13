import { RocketIcon } from "@dust-tt/sparkle";

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
};
