import type {
  ZendeskFetchedTicket,
  ZendeskFetchedTicketField,
} from "@connectors/connectors/zendesk/lib/types";
import { listZendeskTicketFields } from "@connectors/connectors/zendesk/lib/zendesk_api";
import logger from "@connectors/logger/logger";

// Cache for ticket field definitions to avoid repeated API calls
const ticketFieldsCache = new Map<string, ZendeskFetchedTicketField[]>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cacheTimestamps = new Map<string, number>();

/**
 * Fetches ticket field definitions from cache or Zendesk API
 */
async function getTicketFields({
  accessToken,
  brandSubdomain,
}: {
  accessToken: string;
  brandSubdomain: string;
}): Promise<ZendeskFetchedTicketField[]> {
  const cacheKey = brandSubdomain;
  const now = Date.now();
  const lastCached = cacheTimestamps.get(cacheKey) || 0;

  // Return cached data if it's still fresh
  if (now - lastCached < CACHE_TTL_MS && ticketFieldsCache.has(cacheKey)) {
    return ticketFieldsCache.get(cacheKey)!;
  }

  try {
    const fields = await listZendeskTicketFields({
      accessToken,
      brandSubdomain,
    });

    ticketFieldsCache.set(cacheKey, fields);
    cacheTimestamps.set(cacheKey, now);
    return fields;
  } catch (error) {
    logger.warn(
      { brandSubdomain, error },
      "[Zendesk] Failed to fetch ticket fields, returning empty array"
    );
    return [];
  }
}

/**
 * Converts Zendesk ticket custom fields to Dust labels/tags
 */
export async function convertCustomFieldsToLabels({
  ticket,
  accessToken,
  brandSubdomain,
}: {
  ticket: ZendeskFetchedTicket;
  accessToken: string;
  brandSubdomain: string;
}): Promise<string[]> {
  if (!ticket.custom_fields || ticket.custom_fields.length === 0) {
    return [];
  }

  const ticketFields = await getTicketFields({ accessToken, brandSubdomain });
  const fieldMap = new Map<number, ZendeskFetchedTicketField>();

  // Create a map of field ID to field definition for quick lookup
  for (const field of ticketFields) {
    fieldMap.set(field.id, field);
  }

  const labels: string[] = [];

  for (const customField of ticket.custom_fields) {
    if (!customField.value || customField.value.trim() === "") {
      continue; // Skip empty values
    }

    const fieldDef = fieldMap.get(customField.id);
    if (!fieldDef || !fieldDef.active) {
      continue; // Skip fields we don't have definitions for or inactive fields
    }

    // Use the field title as the label key
    const fieldTitle = fieldDef.title || `field_${customField.id}`;
    let labelValue = customField.value.trim();

    // For dropdown/tagger fields, try to find the human-readable option name
    if (
      (fieldDef.type === "dropdown" || fieldDef.type === "tagger") &&
      fieldDef.custom_field_options
    ) {
      const option = fieldDef.custom_field_options.find(
        (opt) => opt.value === customField.value
      );
      if (option) {
        labelValue = option.name || option.value;
      }
    }

    // Create a label in the format "FieldName:Value"
    const label = `${fieldTitle}:${labelValue}`;
    labels.push(label);
  }

  return labels;
}
