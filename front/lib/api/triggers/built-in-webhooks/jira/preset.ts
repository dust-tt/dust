import {
  issueCreatedExample,
  issueCreatedSchema,
} from "@app/lib/api/triggers/built-in-webhooks/jira/schemas/issue_created";
import {
  issueDeletedExample,
  issueDeletedSchema,
} from "@app/lib/api/triggers/built-in-webhooks/jira/schemas/issue_deleted";
import {
  issueUpdatedExample,
  issueUpdatedSchema,
} from "@app/lib/api/triggers/built-in-webhooks/jira/schemas/issue_updated";
import { JIRA_WEBHOOK_METADATA } from "@app/lib/triggers/built-in-webhooks/jira/preset";
import type {
  BaseWebhookPreset,
  WebhookEvent,
} from "@app/types/triggers/webhooks_source_preset";

const eventPayloads = {
  "jira:issue_created": {
    schema: issueCreatedSchema,
    sample: issueCreatedExample,
  },
  "jira:issue_updated": {
    schema: issueUpdatedSchema,
    sample: issueUpdatedExample,
  },
  "jira:issue_deleted": {
    schema: issueDeletedSchema,
    sample: issueDeletedExample,
  },
} satisfies Record<
  (typeof JIRA_WEBHOOK_METADATA.events)[number]["value"],
  Pick<WebhookEvent, "schema" | "sample">
>;

export const JIRA_WEBHOOK_PRESET: BaseWebhookPreset = {
  ...JIRA_WEBHOOK_METADATA,
  events: JIRA_WEBHOOK_METADATA.events.map((event) => ({
    ...event,
    ...eventPayloads[event.value],
  })),
  filterGenerationInstructions: null,
};
