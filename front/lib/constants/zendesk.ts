export const ZENDESK_CONFIG_KEYS = {
  TICKET_TAGS_TO_INCLUDE: "zendeskTicketTagsToInclude",
  TICKET_TAGS_TO_EXCLUDE: "zendeskTicketTagsToExclude",
  ORGANIZATION_TAGS_TO_INCLUDE: "zendeskOrganizationTagsToInclude",
  ORGANIZATION_TAGS_TO_EXCLUDE: "zendeskOrganizationTagsToExclude",
  CUSTOM_FIELDS_CONFIG: "zendeskCustomFieldsConfig",
  SYNC_UNRESOLVED_TICKETS: "zendeskSyncUnresolvedTicketsEnabled",
  HIDE_CUSTOMER_DETAILS: "zendeskHideCustomerDetails",
  RETENTION_PERIOD: "zendeskRetentionPeriodDays",
} as const;
