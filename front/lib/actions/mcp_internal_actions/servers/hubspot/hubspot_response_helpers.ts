import type { SimplePublicObject } from "@hubspot/api-client/lib/codegen/crm/objects/models/SimplePublicObject";
import type { Property } from "@hubspot/api-client/lib/codegen/crm/properties/models/Property";

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

const IMPORTANT_DATE_FIELDS: Record<string, string[]> = {
  contacts: ["createdate", "lastmodifieddate"],
  companies: ["createdate", "lastmodifieddate"],
  deals: ["closedate", "createdate", "lastmodifieddate"],
};

function formatHubSpotObject(
  object: SimplePublicObject,
  objectType: string,
  portalId?: string
): HubSpotObjectSummary {
  const getTitleField = (type: string): string => {
    switch (type) {
      case "contacts":
        return object.properties.firstname && object.properties.lastname
          ? `${object.properties.firstname} ${object.properties.lastname}`
          : // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            object.properties.email ||
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              object.properties.firstname ||
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              object.properties.lastname ||
              "Unnamed Contact";
      case "companies":
        return (
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          object.properties.name ||
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          object.properties.domain ||
          "Unnamed Company"
        );
      case "deals":
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        return object.properties.dealname || "Unnamed Deal";

      default:
        return (
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          object.properties.name ||
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
          allowlist.includes(key))
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
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    created_at: object.properties.createdate || undefined,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    updated_at: object.properties.lastmodifieddate || undefined,
  };
}

function formatHubSpotProperty(property: Property): HubSpotPropertySummary {
  return {
    name: property.name,
    label: property.label || property.name,
    type: property.type,
    description: property.description || undefined,
    required: false,
    options:
      property.options?.slice(0, 20).map((option) => ({
        label: option.label,
        value: option.value,
      })) || undefined,
  };
}

export function formatHubSpotSearchResults(
  objects: SimplePublicObject[],
  objectType: string,
  portalId?: string
): HubSpotObjectSummary[] {
  return objects.map((object) => {
    return formatHubSpotObject(object, objectType, portalId);
  });
}

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

function formatHubSpotPropertiesAsText(
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
        text += `\n   Options: ${summary.options.map((o) => `${o.label} (${o.value})`).join(", ")}`;
      }
      return text;
    })
    .join("\n\n");

  const typeText = creatableOnly ? "creatable properties" : "properties";
  return `Found ${properties.length} ${typeText} for ${objectType}:\n\n${formatted}`;
}

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
        text += `\n   Options: ${property.options.map((o) => `${o.label} (${o.value})`).join(", ")}`;
      }
      return text;
    })
    .join("\n\n");

  const typeText = creatableOnly ? "creatable properties" : "properties";
  return `Found ${properties.length} ${typeText} for ${objectType}:\n\n${formatted}`;
}

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
