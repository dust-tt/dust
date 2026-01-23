import {
  organizationCreatedExample,
  organizationCreatedSchema,
} from "@app/lib/triggers/built-in-webhooks/zendesk/schemas/organization_created";
import {
  ticketAgentAssignmentChangedExample,
  ticketAgentAssignmentChangedSchema,
} from "@app/lib/triggers/built-in-webhooks/zendesk/schemas/ticket_agent_assignment_changed";
import {
  ticketCommentAddedExample,
  ticketCommentAddedSchema,
} from "@app/lib/triggers/built-in-webhooks/zendesk/schemas/ticket_comment_added";
import {
  ticketCreatedExample,
  ticketCreatedSchema,
} from "@app/lib/triggers/built-in-webhooks/zendesk/schemas/ticket_created";
import {
  ticketPriorityChangedExample,
  ticketPriorityChangedSchema,
} from "@app/lib/triggers/built-in-webhooks/zendesk/schemas/ticket_priority_changed";
import {
  ticketStatusChangedExample,
  ticketStatusChangedSchema,
} from "@app/lib/triggers/built-in-webhooks/zendesk/schemas/ticket_status_changed";
import {
  userCreatedExample,
  userCreatedSchema,
} from "@app/lib/triggers/built-in-webhooks/zendesk/schemas/user_created";
import type { WebhookEvent } from "@app/types/triggers/webhooks_source_preset";

export const ZENDESK_TICKET_CREATED_EVENT: WebhookEvent = {
  name: "ticket.created",
  value: "zen:event-type:ticket.created",
  description: "A ticket was created",
  schema: ticketCreatedSchema,
  sample: ticketCreatedExample,
};

export const ZENDESK_TICKET_COMMENT_ADDED_EVENT: WebhookEvent = {
  name: "ticket.comment_added",
  value: "zen:event-type:ticket.comment_added",
  description: "A comment was added to a ticket",
  schema: ticketCommentAddedSchema,
  sample: ticketCommentAddedExample,
};

export const ZENDESK_TICKET_STATUS_CHANGED_EVENT: WebhookEvent = {
  name: "ticket.status_changed",
  value: "zen:event-type:ticket.status_changed",
  description: "A ticket's status changed",
  schema: ticketStatusChangedSchema,
  sample: ticketStatusChangedExample,
};

export const ZENDESK_TICKET_PRIORITY_CHANGED_EVENT: WebhookEvent = {
  name: "ticket.priority_changed",
  value: "zen:event-type:ticket.priority_changed",
  description: "A ticket's priority changed",
  schema: ticketPriorityChangedSchema,
  sample: ticketPriorityChangedExample,
};

export const ZENDESK_TICKET_AGENT_ASSIGNMENT_CHANGED_EVENT: WebhookEvent = {
  name: "ticket.agent_assignment_changed",
  value: "zen:event-type:ticket.agent_assignment_changed",
  description: "A ticket was reassigned to another agent",
  schema: ticketAgentAssignmentChangedSchema,
  sample: ticketAgentAssignmentChangedExample,
};

export const ZENDESK_USER_CREATED_EVENT: WebhookEvent = {
  name: "user.created",
  value: "zen:event-type:user.created",
  description: "A user was created",
  schema: userCreatedSchema,
  sample: userCreatedExample,
};

export const ZENDESK_ORGANIZATION_CREATED_EVENT: WebhookEvent = {
  name: "organization.created",
  value: "zen:event-type:organization.created",
  description: "An organization was created",
  schema: organizationCreatedSchema,
  sample: organizationCreatedExample,
};

export const ZENDESK_WEBHOOK_EVENTS = [
  ZENDESK_TICKET_CREATED_EVENT,
  ZENDESK_TICKET_STATUS_CHANGED_EVENT,
  ZENDESK_TICKET_COMMENT_ADDED_EVENT,
  ZENDESK_TICKET_AGENT_ASSIGNMENT_CHANGED_EVENT,
  ZENDESK_TICKET_PRIORITY_CHANGED_EVENT,
  ZENDESK_USER_CREATED_EVENT,
  ZENDESK_ORGANIZATION_CREATED_EVENT,
];
