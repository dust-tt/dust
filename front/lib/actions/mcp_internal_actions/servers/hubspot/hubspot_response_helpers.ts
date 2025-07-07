import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { SimplePublicObject } from "@hubspot/api-client/lib/codegen/crm/objects/models/SimplePublicObject";
import type { Property } from "@hubspot/api-client/lib/codegen/crm/properties/models/Property";

import type { SearchResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";

// HubSpot-specific resource types
export interface HubSpotObjectSummary {
  id: string;
  type: string;
  title: string;
  url?: string;
  properties: Record<string, string>;
  created_at?: string;
  updated_at?: string;
}

export interface HubSpotPropertySummary {
  name: string;
  label: string;
  type: string;
  description?: string;
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
}

/**
 * Important date fields to always include for each object type
 */
const IMPORTANT_DATE_FIELDS: Record<string, string[]> = {
  contacts: ["createdate", "lastmodifieddate"],
  companies: ["createdate", "lastmodifieddate"],
  deals: ["closedate", "createdate", "lastmodifieddate"],
  tickets: ["createdate", "lastmodifieddate", "closedate"],
};

/**
 * Transform a raw HubSpot SimplePublicObject into a clean summary
 */
export function formatHubSpotObject(
  object: SimplePublicObject,
  objectType: string,
  portalId?: string
): HubSpotObjectSummary {
  const getTitleField = (type: string): string => {
    switch (type) {
      case "contacts":
        return object.properties.firstname && object.properties.lastname
          ? `${object.properties.firstname} ${object.properties.lastname}`
          : object.properties.email ||
              object.properties.firstname ||
              object.properties.lastname ||
              "Unnamed Contact";
      case "companies":
        return (
          object.properties.name ||
          object.properties.domain ||
          "Unnamed Company"
        );
      case "deals":
        return object.properties.dealname || "Unnamed Deal";
      case "tickets":
        return object.properties.subject || `Ticket #${object.id}`;
      default:
        return (
          object.properties.name ||
          object.properties.title ||
          `${type.slice(0, -1)} #${object.id}`
        );
    }
  };

  const allowlist = IMPORTANT_DATE_FIELDS[objectType] || [];

  const cleanProperties = Object.entries(object.properties)
    .filter(
      ([key, value]) =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        !key.startsWith("hs_") &&
        !key.includes("_id") &&
        key !== "hubspot_owner_id" &&
        ((!key.includes("_date") && !key.includes("_timestamp")) ||
          allowlist.includes(key)) // Only filter out _date/_timestamp if not in allowlist
    )
    .reduce(
      (acc, [key, value]) => {
        acc[key] = String(value);
        return acc;
      },
      {} as Record<string, string>
    );

  const hubSpotUrl = portalId
    ? `https://app.hubspot.com/contacts/${portalId}/${objectType}/${object.id}`
    : undefined;

  return {
    id: object.id,
    type: objectType,
    title: getTitleField(objectType),
    url: hubSpotUrl,
    properties: cleanProperties,
    created_at: object.properties.createdate || undefined,
    updated_at: object.properties.lastmodifieddate || undefined,
  };
}

/**
 * Transform a raw HubSpot Property into a clean summary
 */
export function formatHubSpotProperty(
  property: Property
): HubSpotPropertySummary {
  return {
    name: property.name,
    label: property.label || property.name,
    type: property.type,
    description: property.description || undefined,
    required: false, // HubSpot API doesn't provide required info directly
    options:
      property.options?.slice(0, 20).map((option) => ({
        label: option.label,
        value: option.value,
      })) || undefined,
  };
}

/**
 * Transform HubSpot objects into SearchResultResourceType format
 */
export function formatHubSpotSearchResults(
  objects: SimplePublicObject[],
  objectType: string,
  query: string,
  portalId?: string
): SearchResultResourceType[] {
  return objects.map((object, index) => {
    const formatted = formatHubSpotObject(object, objectType, portalId);

    return {
      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_RESULT,
      uri: formatted.url || "",
      text: formatted.title,
      id: formatted.id,
      tags: [
        objectType,
        ...(formatted.created_at ? [`created: ${formatted.created_at}`] : []),
        ...(formatted.updated_at ? [`updated: ${formatted.updated_at}`] : []),
      ],
      ref: `[${index + 1}]`,
      chunks: Object.entries(formatted.properties).map(
        ([key, value]) => `${key}: ${value}`
      ),
      source: {
        provider: "hubspot",
      },
    };
  });
}

/**
 * Create a formatted text summary of HubSpot objects
 */
export function formatHubSpotObjectsAsText(
  objects: SimplePublicObject[],
  objectType: string,
  portalId?: string
): string {
  if (objects.length === 0) {
    return `No ${objectType} found.`;
  }

  const formatted = objects
    .map((object, index) => {
      const summary = formatHubSpotObject(object, objectType, portalId);
      const propertiesText = Object.entries(summary.properties)
        .map(([key, value]) => `  ${key}: ${value}`)
        .join("\n");

      return `${index + 1}. ${summary.title} (ID: ${summary.id})${summary.url ? `\n   URL: ${summary.url}` : ""}${propertiesText ? `\n${propertiesText}` : ""}`;
    })
    .join("\n\n");

  return `Found ${objects.length} ${objectType}:\n\n${formatted}`;
}

/**
 * Format properties list as clean text
 */
export function formatHubSpotPropertiesAsText(
  properties: Property[],
  objectType: string,
  creatableOnly: boolean = false
): string {
  if (properties.length === 0) {
    return `No properties found for ${objectType}.`;
  }

  const formatted = properties
    .map((property, index) => {
      const summary = formatHubSpotProperty(property);
      let text = `${index + 1}. ${summary.name} (${summary.label})`;
      text += `\n   Type: ${summary.type}`;
      if (summary.description) {
        text += `\n   Description: ${summary.description}`;
      }
      if (summary.required) {
        text += `\n   Required: Yes`;
      }
      if (summary.options && summary.options.length > 0) {
        text += `\n   Options: ${summary.options.map((o) => o.label).join(", ")}`;
      }
      return text;
    })
    .join("\n\n");

  const typeText = creatableOnly ? "creatable properties" : "properties";
  return `Found ${properties.length} ${typeText} for ${objectType}:\n\n${formatted}`;
}

/**
 * Format transformed properties list (from getObjectProperties) as clean text
 */
export function formatTransformedPropertiesAsText(
  properties: Array<{
    name: string;
    label: string;
    type: string;
    description?: string;
    options?: Array<{ label: string; value: string }>;
  }>,
  objectType: string,
  creatableOnly: boolean = false
): string {
  if (properties.length === 0) {
    return `No properties found for ${objectType}.`;
  }

  const formatted = properties
    .map((property, index) => {
      let text = `${index + 1}. ${property.name} (${property.label})`;
      text += `\n   Type: ${property.type}`;
      if (property.description) {
        text += `\n   Description: ${property.description}`;
      }
      if (property.options && property.options.length > 0) {
        text += `\n   Options: ${property.options.map((o) => o.label).join(", ")}`;
      }
      return text;
    })
    .join("\n\n");

  const typeText = creatableOnly ? "creatable properties" : "properties";
  return `Found ${properties.length} ${typeText} for ${objectType}:\n\n${formatted}`;
}

/**
 * Create a simple creation success message
 */
export function formatHubSpotCreateSuccess(
  object: SimplePublicObject,
  objectType: string,
  portalId?: string
): { message: string; result: HubSpotObjectSummary } {
  const formatted = formatHubSpotObject(object, objectType, portalId);

  return {
    message: `${objectType.slice(0, -1)} created successfully: ${formatted.title}`,
    result: formatted,
  };
}

/**
 * Create a simple update success message
 */
export function formatHubSpotUpdateSuccess(
  object: SimplePublicObject,
  objectType: string,
  portalId?: string
): { message: string; result: HubSpotObjectSummary } {
  const formatted = formatHubSpotObject(object, objectType, portalId);

  return {
    message: `${objectType.slice(0, -1)} updated successfully: ${formatted.title}`,
    result: formatted,
  };
}

/**
 * Create a simple get success message
 */
export function formatHubSpotGetSuccess(
  object: SimplePublicObject,
  objectType: string,
  portalId?: string
): { message: string; result: HubSpotObjectSummary } {
  const formatted = formatHubSpotObject(object, objectType, portalId);

  return {
    message: `${objectType.slice(0, -1)} retrieved successfully: ${formatted.title}`,
    result: formatted,
  };
}
