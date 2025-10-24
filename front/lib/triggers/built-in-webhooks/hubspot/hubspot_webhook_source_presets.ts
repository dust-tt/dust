import { HubspotLogo } from "@dust-tt/sparkle";
import type { JSONSchema7 as JSONSchema } from "json-schema";

import { CreateWebhookHubspotConnection } from "@app/lib/triggers/built-in-webhooks/hubspot/components/CreateWebhookHubspotConnection";
import { WebhookSourceHubspotDetails } from "@app/lib/triggers/built-in-webhooks/hubspot/components/WebhookSourceHubspotDetails";
import { HubspotWebhookService } from "@app/lib/triggers/built-in-webhooks/hubspot/hubspot_webhook_service";
import type {
  PresetWebhook,
  WebhookEvent,
} from "@app/types/triggers/webhooks_source_preset";

// Base schema for HubSpot webhook events
const hubspotEventSchema: JSONSchema = {
  type: "object",
  properties: {
    objectId: {
      type: "number",
      description: "The ID of the object that triggered the event",
    },
    propertyName: {
      type: "string",
      description:
        "The name of the property that changed (for propertyChange events)",
    },
    propertyValue: {
      type: "string",
      description: "The new value of the property (for propertyChange events)",
    },
    changeSource: {
      type: "string",
      description: "The source of the change",
    },
    eventId: {
      type: "number",
      description: "Unique ID for the event",
    },
    subscriptionId: {
      type: "number",
      description: "ID of the subscription that triggered this event",
    },
    portalId: {
      type: "number",
      description: "HubSpot portal ID",
    },
    appId: {
      type: "number",
      description: "HubSpot app ID",
    },
    occurredAt: {
      type: "number",
      description: "Timestamp when the event occurred (milliseconds)",
    },
    subscriptionType: {
      type: "string",
      description: "The type of subscription (e.g., contact.creation)",
    },
    attemptNumber: {
      type: "number",
      description: "Number of delivery attempts for this event",
    },
  },
  required: [
    "objectId",
    "eventId",
    "subscriptionId",
    "portalId",
    "appId",
    "occurredAt",
    "subscriptionType",
  ],
};

// Contact events
const HUBSPOT_CONTACT_CREATED_EVENT: WebhookEvent = {
  name: "contact.creation",
  value: "contact.creation",
  description: "Triggered when a new contact is created in HubSpot",
  schema: hubspotEventSchema,
};

const HUBSPOT_CONTACT_DELETED_EVENT: WebhookEvent = {
  name: "contact.deletion",
  value: "contact.deletion",
  description: "Triggered when a contact is deleted in HubSpot",
  schema: hubspotEventSchema,
};

const HUBSPOT_CONTACT_PROPERTY_CHANGE_EVENT: WebhookEvent = {
  name: "contact.propertyChange",
  value: "contact.propertyChange",
  description: "Triggered when a contact property is changed in HubSpot",
  schema: hubspotEventSchema,
};

// Company events
const HUBSPOT_COMPANY_CREATED_EVENT: WebhookEvent = {
  name: "company.creation",
  value: "company.creation",
  description: "Triggered when a new company is created in HubSpot",
  schema: hubspotEventSchema,
};

const HUBSPOT_COMPANY_DELETED_EVENT: WebhookEvent = {
  name: "company.deletion",
  value: "company.deletion",
  description: "Triggered when a company is deleted in HubSpot",
  schema: hubspotEventSchema,
};

const HUBSPOT_COMPANY_PROPERTY_CHANGE_EVENT: WebhookEvent = {
  name: "company.propertyChange",
  value: "company.propertyChange",
  description: "Triggered when a company property is changed in HubSpot",
  schema: hubspotEventSchema,
};

// Deal events
const HUBSPOT_DEAL_CREATED_EVENT: WebhookEvent = {
  name: "deal.creation",
  value: "deal.creation",
  description: "Triggered when a new deal is created in HubSpot",
  schema: hubspotEventSchema,
};

const HUBSPOT_DEAL_DELETED_EVENT: WebhookEvent = {
  name: "deal.deletion",
  value: "deal.deletion",
  description: "Triggered when a deal is deleted in HubSpot",
  schema: hubspotEventSchema,
};

const HUBSPOT_DEAL_PROPERTY_CHANGE_EVENT: WebhookEvent = {
  name: "deal.propertyChange",
  value: "deal.propertyChange",
  description: "Triggered when a deal property is changed in HubSpot",
  schema: hubspotEventSchema,
};

// Ticket events
const HUBSPOT_TICKET_CREATED_EVENT: WebhookEvent = {
  name: "ticket.creation",
  value: "ticket.creation",
  description: "Triggered when a new ticket is created in HubSpot",
  schema: hubspotEventSchema,
};

const HUBSPOT_TICKET_DELETED_EVENT: WebhookEvent = {
  name: "ticket.deletion",
  value: "ticket.deletion",
  description: "Triggered when a ticket is deleted in HubSpot",
  schema: hubspotEventSchema,
};

const HUBSPOT_TICKET_PROPERTY_CHANGE_EVENT: WebhookEvent = {
  name: "ticket.propertyChange",
  value: "ticket.propertyChange",
  description: "Triggered when a ticket property is changed in HubSpot",
  schema: hubspotEventSchema,
};

// Product events
const HUBSPOT_PRODUCT_CREATED_EVENT: WebhookEvent = {
  name: "product.creation",
  value: "product.creation",
  description: "Triggered when a new product is created in HubSpot",
  schema: hubspotEventSchema,
};

const HUBSPOT_PRODUCT_DELETED_EVENT: WebhookEvent = {
  name: "product.deletion",
  value: "product.deletion",
  description: "Triggered when a product is deleted in HubSpot",
  schema: hubspotEventSchema,
};

const HUBSPOT_PRODUCT_PROPERTY_CHANGE_EVENT: WebhookEvent = {
  name: "product.propertyChange",
  value: "product.propertyChange",
  description: "Triggered when a product property is changed in HubSpot",
  schema: hubspotEventSchema,
};

export const HUBSPOT_WEBHOOK_PRESET: PresetWebhook = {
  name: "HubSpot",
  eventCheck: {
    type: "headers",
    field: "X-HubSpot-Signature",
  },
  events: [
    HUBSPOT_CONTACT_CREATED_EVENT,
    HUBSPOT_CONTACT_DELETED_EVENT,
    HUBSPOT_CONTACT_PROPERTY_CHANGE_EVENT,
    HUBSPOT_COMPANY_CREATED_EVENT,
    HUBSPOT_COMPANY_DELETED_EVENT,
    HUBSPOT_COMPANY_PROPERTY_CHANGE_EVENT,
    HUBSPOT_DEAL_CREATED_EVENT,
    HUBSPOT_DEAL_DELETED_EVENT,
    HUBSPOT_DEAL_PROPERTY_CHANGE_EVENT,
    HUBSPOT_TICKET_CREATED_EVENT,
    HUBSPOT_TICKET_DELETED_EVENT,
    HUBSPOT_TICKET_PROPERTY_CHANGE_EVENT,
    HUBSPOT_PRODUCT_CREATED_EVENT,
    HUBSPOT_PRODUCT_DELETED_EVENT,
    HUBSPOT_PRODUCT_PROPERTY_CHANGE_EVENT,
  ],
  icon: HubspotLogo,
  description:
    "Receive events from HubSpot such as creation, deletion, or property changes for contacts, companies, deals, tickets, and products.",
  featureFlag: "hootl_dev_webhooks",
  webhookService: new HubspotWebhookService(),
  components: {
    detailsComponent: WebhookSourceHubspotDetails,
    createFormComponent: CreateWebhookHubspotConnection,
  },
};
