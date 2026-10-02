import {
  organizationCreatedExample,
  organizationCreatedSchema,
} from "@app/lib/api/triggers/built-in-webhooks/zendesk/schemas/organization_created";
import {
  ticketAgentAssignmentChangedExample,
  ticketAgentAssignmentChangedSchema,
} from "@app/lib/api/triggers/built-in-webhooks/zendesk/schemas/ticket_agent_assignment_changed";
import {
  ticketCommentAddedExample,
  ticketCommentAddedSchema,
} from "@app/lib/api/triggers/built-in-webhooks/zendesk/schemas/ticket_comment_added";
import {
  ticketCreatedExample,
  ticketCreatedSchema,
} from "@app/lib/api/triggers/built-in-webhooks/zendesk/schemas/ticket_created";
import {
  ticketPriorityChangedExample,
  ticketPriorityChangedSchema,
} from "@app/lib/api/triggers/built-in-webhooks/zendesk/schemas/ticket_priority_changed";
import {
  ticketStatusChangedExample,
  ticketStatusChangedSchema,
} from "@app/lib/api/triggers/built-in-webhooks/zendesk/schemas/ticket_status_changed";
import {
  userCreatedExample,
  userCreatedSchema,
} from "@app/lib/api/triggers/built-in-webhooks/zendesk/schemas/user_created";
import { ZENDESK_WEBHOOK_METADATA } from "@app/lib/triggers/built-in-webhooks/zendesk/preset";
import type {
  BaseWebhookPreset,
  WebhookEvent,
} from "@app/types/triggers/webhooks_source_preset";

const eventPayloads = {
  "zen:event-type:ticket.created": {
    schema: ticketCreatedSchema,
    sample: ticketCreatedExample,
  },
  "zen:event-type:ticket.comment_added": {
    schema: ticketCommentAddedSchema,
    sample: ticketCommentAddedExample,
  },
  "zen:event-type:ticket.status_changed": {
    schema: ticketStatusChangedSchema,
    sample: ticketStatusChangedExample,
  },
  "zen:event-type:ticket.priority_changed": {
    schema: ticketPriorityChangedSchema,
    sample: ticketPriorityChangedExample,
  },
  "zen:event-type:ticket.agent_assignment_changed": {
    schema: ticketAgentAssignmentChangedSchema,
    sample: ticketAgentAssignmentChangedExample,
  },
  "zen:event-type:user.created": {
    schema: userCreatedSchema,
    sample: userCreatedExample,
  },
  "zen:event-type:organization.created": {
    schema: organizationCreatedSchema,
    sample: organizationCreatedExample,
  },
} satisfies Record<
  (typeof ZENDESK_WEBHOOK_METADATA.events)[number]["value"],
  Pick<WebhookEvent, "schema" | "sample">
>;

export const ZENDESK_WEBHOOK_PRESET: BaseWebhookPreset = {
  ...ZENDESK_WEBHOOK_METADATA,
  events: ZENDESK_WEBHOOK_METADATA.events.map((event) => ({
    ...event,
    ...eventPayloads[event.value],
  })),
  filterGenerationInstructions: null,
};
