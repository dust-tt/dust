import type { listOwners } from "@app/lib/api/actions/servers/hubspot/client";
import type { SimplePublicObject } from "@hubspot/api-client/lib/codegen/crm/objects/models/SimplePublicObject";

interface HubSpotObjectSummary {
  id: string;
  type: string;
  title: string;
  url?: string;
  properties: Record<string, string>;
  created_at?: string;
  updated_at?: string;
}

export interface HubSpotSearchResponsePayload {
  results: HubSpotObjectSummary[];
  paging?: { after: string };
}

const IMPORTANT_DATE_FIELDS: Record<string, string[]> = {
  contacts: ["createdate", "lastmodifieddate"],
  companies: ["createdate", "lastmodifieddate"],
  deals: ["closedate", "createdate", "lastmodifieddate"],
};

// hs_* fields that carry actual engagement content and must not be stripped.
const HS_CONTENT_FIELDS = new Set([
  "hs_note_body",
  "hs_meeting_title",
  "hs_meeting_body",
  "hs_meeting_outcome",
  "hs_meeting_start_time",
  "hs_meeting_end_time",
  "hs_meeting_location",
  "hs_meeting_external_url",
  "hs_call_body",
  "hs_call_title",
  "hs_call_duration",
  "hs_call_direction",
  "hs_call_status",
  "hs_email_subject",
  "hs_email_text",
  "hs_email_html",
  "hs_task_subject",
  "hs_task_body",
  "hs_task_status",
  "hs_task_priority",
  "hs_timestamp",
  "hs_engagement_type",
  "hs_pipeline",
  "hs_pipeline_stage",
  "hs_ticket_priority",
  "hs_ticket_category",
  "hs_resolution",
]);

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
      case "tickets":
        return object.properties.subject ?? "Unnamed Ticket";

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

  const allowlist = IMPORTANT_DATE_FIELDS[objectType] ?? [];

  const cleanProperties = Object.entries(object.properties)
    .filter(
      ([key, value]) =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        (HS_CONTENT_FIELDS.has(key) ||
          (!key.startsWith("hs_") &&
            !key.includes("_date") &&
            !key.includes("_timestamp")) ||
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

export function formatHubSpotSearchResults(
  objects: SimplePublicObject[],
  objectType: string,
  portalId?: string
): HubSpotObjectSummary[] {
  return objects.map((object) => {
    return formatHubSpotObject(object, objectType, portalId);
  });
}

export function formatHubSpotSearchResponse({
  objects,
  objectType,
  after,
  portalId,
}: {
  objects: SimplePublicObject[];
  objectType: string;
  after?: string;
  portalId?: string;
}): HubSpotSearchResponsePayload {
  return {
    results: formatHubSpotSearchResults(objects, objectType, portalId),
    ...(after ? { paging: { after } } : {}),
  };
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

export function formatOwnersAsText(
  owners: Awaited<ReturnType<typeof listOwners>>
): string {
  const formatted = owners
    .map((owner) => {
      const name = [owner.firstName, owner.lastName].filter(Boolean).join(" ");
      let text = `${name || "Unnamed Owner"} (ID: ${owner.id})`;
      if (owner.email) {
        text += ` - ${owner.email}`;
      }
      if (owner.archived) {
        text += ` [archived]`;
      }
      return text;
    })
    .join("\n\n");

  return `${owners.length} owner(s):\n\n${formatted}`;
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
