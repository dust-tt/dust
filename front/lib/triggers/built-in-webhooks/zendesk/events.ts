import type { WebhookEventMetadata } from "@app/types/triggers/webhooks_source_preset";

const ZENDESK_TICKET_CREATED_EVENT = {
  name: "ticket.created",
  value: "zen:event-type:ticket.created" as const,
  description: "A ticket was created",
} satisfies WebhookEventMetadata;

const ZENDESK_TICKET_COMMENT_ADDED_EVENT = {
  name: "ticket.comment_added",
  value: "zen:event-type:ticket.comment_added" as const,
  description: "A comment was added to a ticket",
} satisfies WebhookEventMetadata;

const ZENDESK_TICKET_STATUS_CHANGED_EVENT = {
  name: "ticket.status_changed",
  value: "zen:event-type:ticket.status_changed" as const,
  description: "A ticket's status changed",
} satisfies WebhookEventMetadata;

const ZENDESK_TICKET_PRIORITY_CHANGED_EVENT = {
  name: "ticket.priority_changed",
  value: "zen:event-type:ticket.priority_changed" as const,
  description: "A ticket's priority changed",
} satisfies WebhookEventMetadata;

const ZENDESK_TICKET_AGENT_ASSIGNMENT_CHANGED_EVENT = {
  name: "ticket.agent_assignment_changed",
  value: "zen:event-type:ticket.agent_assignment_changed" as const,
  description: "A ticket was reassigned to another agent",
} satisfies WebhookEventMetadata;

const ZENDESK_USER_CREATED_EVENT = {
  name: "user.created",
  value: "zen:event-type:user.created" as const,
  description: "A user was created",
} satisfies WebhookEventMetadata;

const ZENDESK_ORGANIZATION_CREATED_EVENT = {
  name: "organization.created",
  value: "zen:event-type:organization.created" as const,
  description: "An organization was created",
} satisfies WebhookEventMetadata;

export const ZENDESK_WEBHOOK_EVENTS = [
  ZENDESK_TICKET_CREATED_EVENT,
  ZENDESK_TICKET_STATUS_CHANGED_EVENT,
  ZENDESK_TICKET_COMMENT_ADDED_EVENT,
  ZENDESK_TICKET_AGENT_ASSIGNMENT_CHANGED_EVENT,
  ZENDESK_TICKET_PRIORITY_CHANGED_EVENT,
  ZENDESK_USER_CREATED_EVENT,
  ZENDESK_ORGANIZATION_CREATED_EVENT,
];
