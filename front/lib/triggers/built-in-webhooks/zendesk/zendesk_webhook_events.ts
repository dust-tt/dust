import { organizationCreatedSchema } from "@app/lib/triggers/built-in-webhooks/zendesk/schemas/json_schema_organization_created";
import { ticketAgentAssignmentChangedSchema } from "@app/lib/triggers/built-in-webhooks/zendesk/schemas/json_schema_ticket_agent_assignment_changed";
import { ticketCommentAddedSchema } from "@app/lib/triggers/built-in-webhooks/zendesk/schemas/json_schema_ticket_comment_added";
import { ticketCreatedSchema } from "@app/lib/triggers/built-in-webhooks/zendesk/schemas/json_schema_ticket_created";
import { ticketPriorityChangedSchema } from "@app/lib/triggers/built-in-webhooks/zendesk/schemas/json_schema_ticket_priority_changed";
import { ticketStatusChangedSchema } from "@app/lib/triggers/built-in-webhooks/zendesk/schemas/json_schema_ticket_status_changed";
import { userCreatedSchema } from "@app/lib/triggers/built-in-webhooks/zendesk/schemas/json_schema_user_created";
import type { WebhookEvent } from "@app/types/triggers/webhooks_source_preset";

export const ZENDESK_TICKET_CREATED_EVENT: WebhookEvent = {
  name: "ticket.created",
  value: "zen:event-type:ticket.created",
  description: "A ticket was created",
  schema: ticketCreatedSchema,
};

export const ZENDESK_TICKET_COMMENT_ADDED_EVENT: WebhookEvent = {
  name: "ticket.comment_added",
  value: "zen:event-type:ticket.comment_added",
  description: "A comment was added to a ticket",
  schema: ticketCommentAddedSchema,
};

export const ZENDESK_TICKET_STATUS_CHANGED_EVENT: WebhookEvent = {
  name: "ticket.status_changed",
  value: "zen:event-type:ticket.status_changed",
  description: "A ticket's status changed",
  schema: ticketStatusChangedSchema,
};

export const ZENDESK_TICKET_PRIORITY_CHANGED_EVENT: WebhookEvent = {
  name: "ticket.priority_changed",
  value: "zen:event-type:ticket.priority_changed",
  description: "A ticket's priority changed",
  schema: ticketPriorityChangedSchema,
};

export const ZENDESK_TICKET_AGENT_ASSIGNMENT_CHANGED_EVENT: WebhookEvent = {
  name: "ticket.agent_assignment_changed",
  value: "zen:event-type:ticket.agent_assignment_changed",
  description: "A ticket was reassigned to another agent",
  schema: ticketAgentAssignmentChangedSchema,
};

export const ZENDESK_USER_CREATED_EVENT: WebhookEvent = {
  name: "user.created",
  value: "zen:event-type:user.created",
  description: "A user was created",
  schema: userCreatedSchema,
};

export const ZENDESK_ORGANIZATION_CREATED_EVENT: WebhookEvent = {
  name: "organization.created",
  value: "zen:event-type:organization.created",
  description: "An organization was created",
  schema: organizationCreatedSchema,
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
