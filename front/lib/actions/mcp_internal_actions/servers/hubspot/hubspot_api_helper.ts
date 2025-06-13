import { Client } from "@hubspot/api-client";
import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/contacts";
import { AssociationSpecAssociationCategoryEnum } from "@hubspot/api-client/lib/codegen/crm/objects/models/AssociationSpec";
import type { SimplePublicObject } from "@hubspot/api-client/lib/codegen/crm/objects/models/SimplePublicObject";
import type { SimplePublicObjectInputForCreate } from "@hubspot/api-client/lib/codegen/crm/objects/models/SimplePublicObjectInputForCreate";
import type { SimplePublicObjectInput } from "@hubspot/api-client/lib/codegen/crm/objects/models/SimplePublicObjectInput";
import type { PublicOwner } from "@hubspot/api-client/lib/codegen/crm/owners/models/PublicOwner";
import type { Property } from "@hubspot/api-client/lib/codegen/crm/properties/models/Property";

import { normalizeError } from "@app/types";

const MAX_ENUM_OPTIONS_DISPLAYED = 50;
export const MAX_LIMIT = 50; // Hubspot API results are capped at 200, but this limit is set lower for internal use.
export const MAX_COUNT_LIMIT = 10000; // This is the Hubspot API limit for total count.

export const SIMPLE_OBJECTS = ["contacts", "companies", "deals"] as const;
type SimpleObjectType = (typeof SIMPLE_OBJECTS)[number];

const SPECIAL_OBJECTS = ["owners"] as const;
type SpecialObjectType = (typeof SPECIAL_OBJECTS)[number];

export const ALL_OBJECTS = [...SIMPLE_OBJECTS, ...SPECIAL_OBJECTS] as const;

/**
 * Get all createable properties for an object.
 * creatableOnly = true: filter out properties that are not createable, hidden, calculated, read-only or file uploads.
 * creatableOnly = false: return all properties.
 */
export const getObjectProperties = async ({
  accessToken,
  objectType,
  creatableOnly,
}: {
  accessToken: string;
  objectType: SimpleObjectType | SpecialObjectType;
  creatableOnly: boolean;
}) => {
  const hubspotClient = new Client({ accessToken });
  const props = await hubspotClient.crm.properties.coreApi.getAll(objectType);
  const isCreateableProperty = (property: Property) =>
    property.formField === true && // Can be used in forms.
    !property.hidden && // Not hidden.
    !property.calculated && // Not auto-calculated.
    !property.modificationMetadata?.readOnlyValue && // Value can be modified.
    property.type !== "file"; // Exclude file uploads if any.

  const createableProperties = creatableOnly
    ? props.results.filter(isCreateableProperty)
    : props.results;

  return createableProperties.map((p) => {
    let options = p.options;
    let description = p.description;

    // Some properties have a lot of options (Ex: language, time zone), we only display the first MAX_ENUM_OPTIONS_DISPLAYED.
    if (
      p.type === "enumeration" &&
      p.options.length > MAX_ENUM_OPTIONS_DISPLAYED
    ) {
      options = p.options.slice(0, MAX_ENUM_OPTIONS_DISPLAYED);
      description = `${description} (displaying the first ${MAX_ENUM_OPTIONS_DISPLAYED} options among ${p.options.length} possible options)`;
    }

    return {
      name: p.name,
      label: p.label,
      type: p.type,
      description,
      options,
    };
  });
};

/**
 * Get an object by email.
 * An email is unique, so there will only be zero or one object with a given email.
 */
export const getObjectByEmail = async (
  accessToken: string,
  objectType: SimpleObjectType | SpecialObjectType,
  email: string
): Promise<SimplePublicObject | PublicOwner | null> => {
  const hubspotClient = new Client({ accessToken });

  if (objectType === "owners") {
    const owners = await hubspotClient.crm.owners.ownersApi.getPage();
    const owner = owners.results.find((owner) => owner.email === email);
    if (owner) {
      return owner;
    }
    return null;
  }

  const properties =
    await hubspotClient.crm.properties.coreApi.getAll(objectType);
  const propertyNames = properties.results.map((p) => p.name);

  const objects = await hubspotClient.crm[objectType].searchApi.doSearch({
    filterGroups: [
      {
        filters: [
          {
            propertyName: "email",
            operator: FilterOperatorEnum.Eq,
            value: email,
          },
        ],
      },
    ],
    properties: propertyNames,
    limit: MAX_LIMIT,
  });

  if (objects.results.length === 0) {
    return null;
  }

  return objects.results[0];
};

interface HubspotFilter {
  propertyName: string;
  operator: FilterOperatorEnum;
  value?: string;
  values?: string[];
}

function buildHubspotFilters(filters: Array<HubspotFilter>) {
  return filters.map(({ propertyName, operator, value, values }) => {
    const filter: HubspotFilter = {
      propertyName,
      operator,
    };
    // Only include value/values if it's not a HAS_PROPERTY or NOT_HAS_PROPERTY operator
    if (
      operator !== FilterOperatorEnum.HasProperty &&
      operator !== FilterOperatorEnum.NotHasProperty
    ) {
      // For IN/NOT_IN, the 'values' array must be included, not the value string.
      if (
        operator === FilterOperatorEnum.In ||
        operator === FilterOperatorEnum.NotIn
      ) {
        // For string properties, values must be lowercase
        if (values?.length) {
          filter.values = values?.map((v) => v.toLowerCase());
        } else {
          throw new Error(`Values array is required for ${operator} operator`);
        }
      } else {
        filter.value = value;
      }
    }
    return filter;
  });
}

export const countObjectsByProperties = async (
  accessToken: string,
  objectType: SimpleObjectType,
  filters: Array<{
    propertyName: string;
    operator: FilterOperatorEnum;
    value?: string;
    values?: string[];
  }>
): Promise<number> => {
  const hubspotClient = new Client({ accessToken });
  const objects = await hubspotClient.crm[objectType].searchApi.doSearch({
    filterGroups: [
      {
        filters: buildHubspotFilters(filters),
      },
    ],
    limit: 1, // We only need to know if there are any objects matching the filters, so 1 is sufficient.
  });

  return objects.total;
};

/**
 * Get latest objects from Hubspot by lastmodifieddate.
 */
export const getLatestObjects = async (
  accessToken: string,
  objectType: SimpleObjectType,
  limit: number
): Promise<SimplePublicObject[]> => {
  const hubspotClient = new Client({ accessToken });

  const availableProperties =
    await hubspotClient.crm.properties.coreApi.getAll(objectType);
  const propertyNames = availableProperties.results.map((p) => p.name);

  const objects = await hubspotClient.crm[objectType].searchApi.doSearch({
    filterGroups: [],
    properties: propertyNames,
    sorts: ["createdate:desc"],
    limit: Math.min(limit, MAX_LIMIT),
  });

  return objects.results;
};

/**
 * Create a contact in Hubspot.
 */
export const createContact = async ({
  accessToken,
  properties,
  associations,
}: {
  accessToken: string;
  properties: Record<string, string>;
  associations?: Array<{
    toObjectId: string;
    toObjectType: string; // e.g., "companies", "deals"
  }>;
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });

  const builtAssociations: SimplePublicObjectInputForCreate["associations"] =
    [];

  if (associations && associations.length > 0) {
    for (const assoc of associations) {
      const associationTypeId = await getAssociationTypeId(
        accessToken,
        "contacts", // fromObjectType is always "contacts" for createContact
        assoc.toObjectType
      );
      if (builtAssociations) {
        builtAssociations.push({
          to: { id: assoc.toObjectId },
          types: [
            {
              associationCategory:
                AssociationSpecAssociationCategoryEnum.HubspotDefined,
              associationTypeId: associationTypeId,
            },
          ],
        });
      }
    }
  }

  const contactData: SimplePublicObjectInputForCreate = {
    properties,
    associations: builtAssociations,
  };

  return hubspotClient.crm.contacts.basicApi.create(contactData);
};

/**
 * Create a company in Hubspot.
 */
export const createCompany = async ({
  accessToken,
  properties,
  associations,
}: {
  accessToken: string;
  properties: Record<string, string>;
  associations?: Array<{
    toObjectId: string;
    toObjectType: string; // e.g., "contacts", "deals"
  }>;
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });

  const builtAssociations: SimplePublicObjectInputForCreate["associations"] =
    [];

  if (associations && associations.length > 0) {
    for (const assoc of associations) {
      const associationTypeId = await getAssociationTypeId(
        accessToken,
        "companies", // fromObjectType is always "companies" for createCompany
        assoc.toObjectType
      );
      if (builtAssociations) {
        builtAssociations.push({
          to: { id: assoc.toObjectId },
          types: [
            {
              associationCategory:
                AssociationSpecAssociationCategoryEnum.HubspotDefined,
              associationTypeId: associationTypeId,
            },
          ],
        });
      }
    }
  }

  const companyData: SimplePublicObjectInputForCreate = {
    properties,
    associations: builtAssociations,
  };

  return hubspotClient.crm.companies.basicApi.create(companyData);
};

/**
 * Create a deal in Hubspot.
 */
export const createDeal = async ({
  accessToken,
  properties,
  associations,
}: {
  accessToken: string;
  properties: Record<string, string>;
  associations?: Array<{
    toObjectId: string;
    toObjectType: string; // e.g., "contacts", "companies"
  }>;
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });

  const builtAssociations: SimplePublicObjectInputForCreate["associations"] =
    [];

  if (associations && associations.length > 0) {
    for (const assoc of associations) {
      const associationTypeId = await getAssociationTypeId(
        accessToken,
        "deals", // fromObjectType is always "deals" for createDeal
        assoc.toObjectType
      );
      if (builtAssociations) {
        builtAssociations.push({
          to: { id: assoc.toObjectId },
          types: [
            {
              associationCategory:
                AssociationSpecAssociationCategoryEnum.HubspotDefined,
              associationTypeId: associationTypeId,
            },
          ],
        });
      }
    }
  }

  const dealData: SimplePublicObjectInputForCreate = {
    properties,
    associations: builtAssociations,
  };

  return hubspotClient.crm.deals.basicApi.create(dealData);
};

/**
 * Create a note in Hubspot.
 */
export const createNote = async ({
  accessToken,
  properties,
  associations,
}: {
  accessToken: string;
  properties: {
    hs_note_body: string;
    hs_timestamp?: string;
    [key: string]: any;
  };
  associations?: {
    contactIds?: string[];
    companyIds?: string[];
    dealIds?: string[];
    ownerIds?: string[];
    ticketIds?: string[];
  };
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });

  const propertiesForApi = { ...properties };

  if (!propertiesForApi.hs_note_body) {
    throw normalizeError(
      new Error("hs_note_body is required to create a note.")
    );
  }

  if (!propertiesForApi.hs_timestamp) {
    propertiesForApi.hs_timestamp = new Date().toISOString();
  }
  // hs_engagement_type should not be part of propertiesForApi for the "notes" endpoint
  // If it was passed, it won't cause issues here, but it's not used by the notes API directly.
  // Consider explicitly deleting it if it could be problematic: delete propertiesForApi.hs_engagement_type;

  const builtAssociations: SimplePublicObjectInputForCreate["associations"] =
    [];

  if (associations) {
    const associationMappings = [
      { ids: associations.contactIds, toObjectType: "contacts" },
      { ids: associations.companyIds, toObjectType: "companies" },
      { ids: associations.dealIds, toObjectType: "deals" },
      { ids: associations.ticketIds, toObjectType: "tickets" },
      { ids: associations.ownerIds, toObjectType: "owners" },
    ];

    for (const mapping of associationMappings) {
      if (mapping.ids && mapping.ids.length > 0) {
        const associationTypeId = await getAssociationTypeId(
          accessToken,
          "notes", // fromObjectType is "notes"
          mapping.toObjectType
        );
        for (const id of mapping.ids) {
          if (builtAssociations) {
            builtAssociations.push({
              to: { id: id },
              types: [
                {
                  associationCategory:
                    AssociationSpecAssociationCategoryEnum.HubspotDefined,
                  associationTypeId: associationTypeId,
                },
              ],
            });
          }
        }
      }
    }
  }

  const noteInput: SimplePublicObjectInputForCreate = {
    properties: propertiesForApi,
    associations: builtAssociations,
  };

  try {
    const createdNote = await hubspotClient.crm.objects.basicApi.create(
      "notes",
      noteInput
    );
    return createdNote;
  } catch (error) {
    console.error(
      `Error creating note. Input: ${JSON.stringify(noteInput, null, 2)}`,
      error
    );
    throw normalizeError(error);
  }
};

/**
 * Create a lead in Hubspot.
 * Note: Leads are typically represented as Deals with specific pipeline/stage properties, or as custom objects.
 * This function will create a Deal, assuming leads are managed within the Deals object.
 * Ensure your `properties` include necessary fields to identify this deal as a lead (e.g., deal stage, lead status custom property).
 */
export const createLead = async ({
  accessToken,
  properties,
  associations,
}: {
  accessToken: string;
  properties: Record<string, string>;
  associations?: Array<{
    toObjectId: string;
    toObjectType: string; // e.g., "contacts", "companies"
  }>;
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });

  const builtAssociations: SimplePublicObjectInputForCreate["associations"] =
    [];

  if (associations && associations.length > 0) {
    for (const assoc of associations) {
      // Since leads are created as deals, the fromObjectType for association is "deals"
      const associationTypeId = await getAssociationTypeId(
        accessToken,
        "deals",
        assoc.toObjectType
      );
      if (builtAssociations) {
        builtAssociations.push({
          to: { id: assoc.toObjectId },
          types: [
            {
              associationCategory:
                AssociationSpecAssociationCategoryEnum.HubspotDefined,
              associationTypeId: associationTypeId,
            },
          ],
        });
      }
    }
  }

  // Creating a Deal, as Leads are often a type of Deal in HubSpot.
  // The `properties` should contain fields that mark this deal as a lead.
  const leadData: SimplePublicObjectInputForCreate = {
    properties,
    associations: builtAssociations,
  };

  return hubspotClient.crm.deals.basicApi.create(leadData);
};

/**
 * Create a task in Hubspot.
 * Standard task properties include: hs_task_subject, hs_task_body, hs_timestamp (due date), hs_task_status, hs_task_priority.
 */
export const createTask = async ({
  accessToken,
  properties,
  associations,
}: {
  accessToken: string;
  properties: Record<string, string>;
  associations?: Array<{
    toObjectId: string;
    toObjectType: string;
  }>;
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });
  const builtAssociations: SimplePublicObjectInputForCreate["associations"] =
    [];
  if (associations && associations.length > 0) {
    for (const assoc of associations) {
      const associationTypeId = await getAssociationTypeId(
        accessToken,
        "tasks",
        assoc.toObjectType
      );
      if (builtAssociations) {
        builtAssociations.push({
          to: { id: assoc.toObjectId },
          types: [
            {
              associationCategory:
                AssociationSpecAssociationCategoryEnum.HubspotDefined,
              associationTypeId,
            },
          ],
        });
      }
    }
  }
  const taskData: SimplePublicObjectInputForCreate = {
    properties,
    associations: builtAssociations,
  };
  return hubspotClient.crm.objects.basicApi.create("tasks", taskData);
};

/**
 * Create a ticket in Hubspot.
 */
export const createTicket = async ({
  accessToken,
  properties,
  associations,
}: {
  accessToken: string;
  properties: Record<string, string>;
  associations?: Array<{
    toObjectId: string;
    toObjectType: string;
  }>;
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });
  const builtAssociations: SimplePublicObjectInputForCreate["associations"] =
    [];
  if (associations && associations.length > 0) {
    for (const assoc of associations) {
      const associationTypeId = await getAssociationTypeId(
        accessToken,
        "tickets",
        assoc.toObjectType
      );
      if (builtAssociations) {
        builtAssociations.push({
          to: { id: assoc.toObjectId },
          types: [
            {
              associationCategory:
                AssociationSpecAssociationCategoryEnum.HubspotDefined,
              associationTypeId,
            },
          ],
        });
      }
    }
  }
  const ticketData: SimplePublicObjectInputForCreate = {
    properties,
    associations: builtAssociations,
  };
  return hubspotClient.crm.objects.basicApi.create("tickets", ticketData);
};

/**
 * Create a communication (WhatsApp, LinkedIn, or SMS message) in Hubspot.
 * This will create an Engagement object. Specific properties are needed to define the type and content.
 * For example, `hs_communication_channel_type` (e.g., "WHATSAPP", "LINKEDIN_MESSAGE", "SMS")
 * and `hs_communication_body` for the message content.
 */
export const createCommunication = async ({
  accessToken,
  properties, // Must include hs_engagement_type (e.g. 'COMMUNICATION'), hs_communication_channel_type, hs_communication_body
  associations,
}: {
  accessToken: string;
  properties: Record<string, any>; // Changed to any to accommodate hs_engagement_type which might not always be string
  associations?: {
    contactIds?: string[];
    companyIds?: string[];
    dealIds?: string[];
    ticketIds?: string[];
  };
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });

  const finalProperties = { ...properties }; // Create a copy

  if (!finalProperties.hs_engagement_type) {
    finalProperties.hs_engagement_type = "COMMUNICATION"; // Default if not provided, mutate the copy
  }
  if (!finalProperties.hs_communication_channel_type) {
    throw normalizeError(
      new Error(
        "hs_communication_channel_type is required in properties for createCommunication."
      )
    );
  }

  const builtAssociations: SimplePublicObjectInputForCreate["associations"] =
    [];
  if (associations) {
    const associationMappings = [
      { ids: associations.contactIds, toObjectType: "contacts" },
      { ids: associations.companyIds, toObjectType: "companies" },
      { ids: associations.dealIds, toObjectType: "deals" },
      { ids: associations.ticketIds, toObjectType: "tickets" },
    ];
    for (const mapping of associationMappings) {
      if (mapping.ids && mapping.ids.length > 0) {
        const associationTypeId = await getAssociationTypeId(
          accessToken,
          "engagements", // Communications are a type of engagement.
          mapping.toObjectType
        );
        for (const id of mapping.ids) {
          if (builtAssociations) {
            builtAssociations.push({
              to: { id: id },
              types: [
                {
                  associationCategory:
                    AssociationSpecAssociationCategoryEnum.HubspotDefined,
                  associationTypeId,
                },
              ],
            });
          }
        }
      }
    }
  }

  const communicationData: SimplePublicObjectInputForCreate = {
    properties: finalProperties,
    associations: builtAssociations,
  };

  try {
    const communication = await hubspotClient.crm.objects.basicApi.create(
      "engagements",
      communicationData
    );
    return communication;
  } catch (error) {
    console.error(
      `Error creating communication (engagement type: ${finalProperties.hs_engagement_type}, channel: ${finalProperties.hs_communication_channel_type}). Input: ${JSON.stringify(communicationData, null, 2)}`,
      error
    );
    throw normalizeError(error);
  }
};

/**
 * Create a meeting in Hubspot.
 * Meetings are a type of Engagement. Properties will be needed for meeting details (e.g., hs_meeting_title, hs_meeting_start_time, hs_meeting_end_time, hs_meeting_body).
 */
export const createMeeting = async ({
  accessToken,
  properties, // Must include hs_engagement_type="MEETING" and meeting details (e.g. hs_meeting_title, hs_meeting_start_time etc).
  associations, // Direct association IDs, e.g., { contactIds: ["123"], dealIds: ["456"] }
}: {
  accessToken: string;
  properties: Record<string, any>;
  associations?: {
    contactIds?: string[];
    companyIds?: string[];
    dealIds?: string[];
    ticketIds?: string[];
  };
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });

  const finalProperties = { ...properties }; // Create a copy

  // Ensure hs_engagement_type is set for meetings
  if (!finalProperties.hs_engagement_type) {
    finalProperties.hs_engagement_type = "MEETING"; // Mutate the copy
  }
  // Add checks for essential meeting properties like start_time, title if needed

  const builtAssociations: SimplePublicObjectInputForCreate["associations"] =
    [];
  if (associations) {
    const associationMappings = [
      { ids: associations.contactIds, toObjectType: "contacts" },
      { ids: associations.companyIds, toObjectType: "companies" },
      { ids: associations.dealIds, toObjectType: "deals" },
      { ids: associations.ticketIds, toObjectType: "tickets" },
    ];
    for (const mapping of associationMappings) {
      if (mapping.ids && mapping.ids.length > 0) {
        const associationTypeId = await getAssociationTypeId(
          accessToken,
          "engagements",
          mapping.toObjectType
        );
        for (const id of mapping.ids) {
          if (builtAssociations) {
            builtAssociations.push({
              to: { id: id },
              types: [
                {
                  associationCategory:
                    AssociationSpecAssociationCategoryEnum.HubspotDefined,
                  associationTypeId,
                },
              ],
            });
          }
        }
      }
    }
  }

  const meetingInput: SimplePublicObjectInputForCreate = {
    properties: finalProperties,
    associations: builtAssociations,
  };

  try {
    const meeting = await hubspotClient.crm.objects.basicApi.create(
      "engagements",
      meetingInput
    );
    return meeting;
  } catch (error) {
    console.error(
      `Error creating meeting engagement (type: ${finalProperties.hs_engagement_type}). Input: ${JSON.stringify(meetingInput, null, 2)}`,
      error
    );
    throw normalizeError(error);
  }
};

/**
 * Get the correct association type ID for associating an object.
 * @param accessToken HubSpot API access token.
 * @param fromObjectType The type of object being associated (e.g., "tasks", "notes").
 * @param toObjectType The type of object being associated to (e.g., "deals", "contacts").
 * @returns The association type ID.
 */
const getAssociationTypeId = async (
  accessToken: string,
  fromObjectType: string,
  toObjectType: string
): Promise<number> => {
  const response = await fetch(
    `https://api.hubapi.com/crm/v4/associations/${fromObjectType}/${toObjectType}/labels`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const e = new Error(
      `Failed to fetch association types for ${fromObjectType} to ${toObjectType}: ${response.status} ${response.statusText}`
    );
    throw normalizeError(e);
  }

  const data = await response.json();

  if (!data.results || data.results.length === 0) {
    const e = new Error(
      `No association types found for ${fromObjectType} to ${toObjectType}`
    );
    throw normalizeError(e);
  }

  // Assuming the first result is the one needed for standard associations.
  // HubSpot's API may return multiple if custom association types exist between the objects.
  // For standard object-to-object associations (e.g., contact to company), typically one primary ID is used.
  return data.results[0].typeId;
};

/**
 * Get a contact by ID.
 */
export const getContact = async (
  accessToken: string,
  contactId: string
): Promise<SimplePublicObject | null> => {
  const hubspotClient = new Client({ accessToken });
  try {
    // The `properties` parameter is optional for getById. If not provided, default properties are returned.
    // To fetch all properties, one would typically first get property definitions and pass all their names.
    // For a simple get, default properties are usually sufficient.
    const contact =
      await hubspotClient.crm.contacts.basicApi.getById(contactId);
    return contact;
  } catch (error: any) {
    if (error.code === 404) {
      // If the contact is not found, HubSpot API returns a 404.
      // Return null in this case, as per typical "get by ID" patterns.
      return null;
    }
    console.error(`Error fetching contact ${contactId}:`, error);
    throw normalizeError(error);
  }
};

/**
 * Get a company by ID.
 */
export const getCompany = async (
  accessToken: string,
  companyId: string
): Promise<SimplePublicObject | null> => {
  const hubspotClient = new Client({ accessToken });
  try {
    const company =
      await hubspotClient.crm.companies.basicApi.getById(companyId);
    return company;
  } catch (error: any) {
    if (error.code === 404) {
      return null;
    }
    console.error(`Error fetching company ${companyId}:`, error);
    throw normalizeError(error);
  }
};

/**
 * Get a deal by ID.
 */
export const getDeal = async (
  accessToken: string,
  dealId: string
): Promise<SimplePublicObject | null> => {
  const hubspotClient = new Client({ accessToken });
  try {
    const deal = await hubspotClient.crm.deals.basicApi.getById(dealId);
    return deal;
  } catch (error: any) {
    if (error.code === 404) {
      return null;
    }
    console.error(`Error fetching deal ${dealId}:`, error);
    throw normalizeError(error);
  }
};

/**
 * Get a meeting by ID.
 * Meetings are a type of engagement.
 */
export const getMeeting = async (
  accessToken: string,
  meetingId: string
): Promise<SimplePublicObject | null> => {
  // Assuming engagements API returns SimplePublicObject or a compatible type.
  const hubspotClient = new Client({ accessToken });
  try {
    // Meetings are engagements, so we use the engagements API if available and appropriate.
    // If crm.engagements.basicApi.getById exists, it could be used here.
    // If not, or if meetings are also gettable via crm.objects.basicApi, that path is used.
    // We might need to check if this engagement is indeed a meeting, e.g., by its `hs_engagement_type` property.
    // For now, this function returns whatever engagement is found with that ID.
    const meeting = await hubspotClient.crm.objects.basicApi.getById(
      "engagements",
      meetingId
    );
    return meeting; // For now, return whatever engagement is found with that ID.
  } catch (error: any) {
    if (error.code === 404) {
      return null;
    }
    console.error(`Error fetching meeting (engagement) ${meetingId}:`, error);
    throw normalizeError(error);
  }
};

/**
 * Get a publicly available URL for a file that was uploaded using a HubSpot form or API.
 * @param accessToken HubSpot API access token.
 * @param fileId The ID of the file in HubSpot.
 * @returns The public URL of the file, or null if not found or an error occurs.
 */
export const getFilePublicUrl = async (
  accessToken: string,
  fileId: string
): Promise<string | null> => {
  const hubspotClient = new Client({ accessToken });
  try {
    // The HubSpot Node.js client has a files API.
    // The method to get a signed URL might vary slightly based on client version.
    // A common pattern is: client.files.filesApi.getSignedUrl(fileId, options).
    // Let's try to get the file details first, which often include a public URL or a way to generate one.
    const file = await hubspotClient.files.filesApi.getById(fileId);

    // The 'url' property on the file object is usually the public CDN URL.
    // If a temporary signed URL is needed, the getSignedUrl(fileId) method would be used.
    // For a general public URL (if the file is public), this direct URL property is often sufficient.
    if (file && file.url) {
      return file.url;
    } else if (file) {
      console.warn(
        `File ${fileId} found, but it does not have a public URL property.`
      );
      // Fallback: Attempt to get a signed URL if the direct URL isn't available or for temporary access.
      // This part is speculative as the exact method might differ or require specific options.
      try {
        const signedUrlResponse =
          await hubspotClient.files.filesApi.getSignedUrl(
            fileId /*, { property: 'url', size: 'thumbnail', etc. } */
          );
        if (signedUrlResponse && signedUrlResponse.url) {
          return signedUrlResponse.url;
        }
      } catch (signedUrlError) {
        console.warn(
          `Could not get signed URL for file ${fileId}:`,
          signedUrlError
        );
      }
      return null;
    } else {
      return null; // This should be caught by the 404 case below if the file is not found at all.
    }
  } catch (error: any) {
    if (error.code === 404) {
      console.warn(`File ${fileId} not found.`);
      return null;
    }
    console.error(`Error fetching file ${fileId} public URL:`, error);
    throw normalizeError(error);
  }
};

/**
 * Retrieves meetings associated with a specific object (contact, company, or deal).
 * @param accessToken HubSpot API access token.
 * @param objectType The type of the primary object (e.g., "contacts", "companies", "deals").
 * @param objectId The ID of the primary object.
 * @returns A promise that resolves to an array of meeting objects, or null if an error occurs.
 */
export const getAssociatedMeetings = async (
  accessToken: string,
  fromObjectType: "contacts" | "companies" | "deals",
  fromObjectId: string
): Promise<SimplePublicObject[] | null> => {
  const hubspotClient = new Client({ accessToken });
  const associatedMeetingDetails: SimplePublicObject[] = [];
  const toObjectType = "meetings"; // This is the object type to fetch associations for.

  try {
    // 1. Get IDs of associated meetings using the generic associations API
    const associationResults =
      await hubspotClient.crm.associations.v4.basicApi.getPage(
        fromObjectType,
        fromObjectId,
        toObjectType
      );

    const meetingIds = associationResults.results.map(
      (assoc) => assoc.toObjectId
    );

    // 2. Fetch details for each meeting ID
    for (const meetingId of meetingIds) {
      const meetingDetail = await getMeeting(accessToken, meetingId);
      if (
        meetingDetail &&
        meetingDetail.properties?.hs_engagement_type === "MEETING"
      ) {
        associatedMeetingDetails.push(meetingDetail);
      } else if (meetingDetail) {
        console.warn(
          `Associated engagement ${meetingId} is not of type MEETING (type: ${meetingDetail.properties?.hs_engagement_type}). Skipping.`
        );
      }
    }
    return associatedMeetingDetails;
  } catch (error: any) {
    if (error.code === 404) {
      // This could be because the fromObject doesn't exist, or no associations of 'meetings' type exist.
      // The API might return 404 if the association path itself is invalid rather than just empty results.
      console.warn(
        `Error 404 when fetching associated meetings for ${fromObjectType}/${fromObjectId} to ${toObjectType}. This might mean the object does not exist or no such associations exist.`
      );
      return []; // Return an empty array in case of 404, indicating no associated meetings found or accessible.
    }
    console.error(
      `Error fetching associated meetings for ${fromObjectType}/${fromObjectId}:`,
      error
    );
    throw normalizeError(error);
  }
};

/**
 * Search CRM objects of a specific type based on filters, a query string, and other parameters.
 * @param accessToken HubSpot API access token.
 * @param objectType The type of object to search (e.g., "contacts", "companies", "deals", "tickets", etc.).
 * @param filters Array of filters to apply (propertyName, operator, value/values).
 * @param query Optional free-text query string. HubSpot searches default fields.
 * @param propertiesToReturn Array of property names to include in the results.
 * @param limit The maximum number of results to return.
 * @param after The cursor for pagination to get the next set of results.
 * @returns A promise that resolves to an object containing results and paging information.
 */
export const searchCrmObjects = async ({
  accessToken,
  objectType,
  filters,
  query,
  propertiesToReturn,
  limit = MAX_LIMIT, // Default to our defined MAX_LIMIT
  after,
}: {
  accessToken: string;
  objectType:
    | SimpleObjectType
    | "tickets"
    | "line_items"
    | "quotes"
    | "feedback_submissions"
    | "products"; // Extend with other searchable standard objects as needed.
  filters?: Array<HubspotFilter>; // Reusing HubspotFilter interface defined earlier.
  query?: string;
  propertiesToReturn?: string[];
  limit?: number;
  after?: string;
}): Promise<{ results: SimplePublicObject[]; paging?: any } | null> => {
  const hubspotClient = new Client({ accessToken });

  // Ensure propertiesToReturn is populated; otherwise, default properties are returned by the API.
  // If an empty array is explicitly passed, it might fetch no properties or default properties, depending on the API.
  // For robust control, fetching all available properties if `propertiesToReturn` is undefined or empty might be desired,
  // similar to how getObjectsByProperties (now removed) behaved.
  let finalPropertiesToReturn = propertiesToReturn;
  if (!finalPropertiesToReturn || finalPropertiesToReturn.length === 0) {
    // Fetch all property names for the object type if not specified
    try {
      const allProps =
        await hubspotClient.crm.properties.coreApi.getAll(objectType);
      finalPropertiesToReturn = allProps.results.map((p) => p.name);
    } catch (propError) {
      console.error(
        `Error fetching all properties for ${objectType} to include in search:`,
        propError
      );
      // Fallback to an empty array; the API will return default properties in this case.
      finalPropertiesToReturn = [];
    }
  }

  const searchRequest: any = {
    filterGroups: filters ? [{ filters: buildHubspotFilters(filters) }] : [],
    sorts: [{ propertyName: "createdate", direction: "DESCENDING" }], // Default sort order.
    properties: finalPropertiesToReturn,
    limit: Math.min(limit, MAX_LIMIT), // Ensure the limit doesn't exceed MAX_LIMIT.
    after: after,
  };

  if (query) {
    searchRequest.query = query;
  }

  try {
    // The search API is typically under hubspotClient.crm.{objectType}.searchApi.doSearch.
    // However, a more generic path might exist, or a switch for objectType might be needed.
    // For standard objects, it's usually client.crm.objects.basicApi.search, which takes objectType in the path.
    // Let's use client.crm.objects.searchApi.doSearch if that's the modern way.
    // The client structure: client.crm.objects.searchApi.doSearch(objectType, publicObjectSearchRequest) seems not to be available directly.
    // The specific object clients are preferred for reliability.

    let searchResponse;
    switch (objectType) {
      case "contacts":
        searchResponse =
          await hubspotClient.crm.contacts.searchApi.doSearch(searchRequest);
        break;
      case "companies":
        searchResponse =
          await hubspotClient.crm.companies.searchApi.doSearch(searchRequest);
        break;
      case "deals":
        searchResponse =
          await hubspotClient.crm.deals.searchApi.doSearch(searchRequest);
        break;
      case "tickets":
        searchResponse =
          await hubspotClient.crm.tickets.searchApi.doSearch(searchRequest);
        break;
      // For other object types like products, line_items, quotes, feedback_submissions, a similar pattern would apply.
      // These might be under crm.objects.ObjectTypeApi.doSearch or require their own client sections if they exist (e.g., hubspotClient.crm.products.searchApi.doSearch(searchRequest)).
      // For now, an error will be thrown for unhandled types to make it explicit.
      default:
        // An attempt with generic crm.objects.basicApi.search (if it exists and objectType is a string) is speculative.
        // The structure client.crm.objects.basicApi.search(objectType, publicObjectSearchRequest) also seems unlikely.
        // The most reliable way is to use individual object type search APIs as shown above.
        // It is assumed for now that objectType will be one of the handled ones, or an error will be thrown.
        throw new Error(
          `Search for object type "${objectType}" is not explicitly implemented. Add to switch.`
        );
    }

    return {
      results: searchResponse.results,
      paging: searchResponse.paging,
    };
  } catch (error: any) {
    console.error(`Error searching ${objectType}:`, error);
    throw normalizeError(error);
  }
};

/**
 * Update a contact in Hubspot.
 */
export const updateContact = async ({
  accessToken,
  contactId,
  properties,
}: {
  accessToken: string;
  contactId: string;
  properties: Record<string, string>;
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });

  const contactData: SimplePublicObjectInput = {
    properties,
  };

  return hubspotClient.crm.contacts.basicApi.update(contactId, contactData);
};

/**
 * Update a company in Hubspot.
 */
export const updateCompany = async ({
  accessToken,
  companyId,
  properties,
}: {
  accessToken: string;
  companyId: string;
  properties: Record<string, string>;
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });

  const companyData: SimplePublicObjectInput = {
    properties,
  };

  return hubspotClient.crm.companies.basicApi.update(companyId, companyData);
};

/**
 * Update a deal in Hubspot.
 */
export const updateDeal = async ({
  accessToken,
  dealId,
  properties,
}: {
  accessToken: string;
  dealId: string;
  properties: Record<string, string>;
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });

  const dealData: SimplePublicObjectInput = {
    properties,
  };

  return hubspotClient.crm.deals.basicApi.update(dealId, dealData);
};

/**
 * Update a ticket in Hubspot.
 */
export const updateTicket = async ({
  accessToken,
  ticketId,
  properties,
}: {
  accessToken: string;
  ticketId: string;
  properties: Record<string, string>;
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });

  const ticketData: SimplePublicObjectInput = {
    properties,
  };

  return hubspotClient.crm.objects.basicApi.update("tickets", ticketId, ticketData);
};

/**
 * Update a task in Hubspot.
 */
export const updateTask = async ({
  accessToken,
  taskId,
  properties,
}: {
  accessToken: string;
  taskId: string;
  properties: Record<string, string>;
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });

  const taskData: SimplePublicObjectInput = {
    properties,
  };

  return hubspotClient.crm.objects.basicApi.update("tasks", taskId, taskData);
};

/**
 * Update a note in Hubspot.
 */
export const updateNote = async ({
  accessToken,
  noteId,
  properties,
}: {
  accessToken: string;
  noteId: string;
  properties: {
    hs_note_body?: string;
    hs_timestamp?: string;
    [key: string]: any;
  };
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });

  const noteData: SimplePublicObjectInput = {
    properties,
  };

  try {
    const updatedNote = await hubspotClient.crm.objects.basicApi.update(
      "notes",
      noteId,
      noteData
    );
    return updatedNote;
  } catch (error) {
    console.error(
      `Error updating note ${noteId}. Input: ${JSON.stringify(noteData, null, 2)}`,
      error
    );
    throw normalizeError(error);
  }
};

/**
 * Update a meeting in Hubspot.
 */
export const updateMeeting = async ({
  accessToken,
  meetingId,
  properties,
}: {
  accessToken: string;
  meetingId: string;
  properties: Record<string, any>;
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });

  const meetingData: SimplePublicObjectInput = {
    properties,
  };

  try {
    const updatedMeeting = await hubspotClient.crm.objects.basicApi.update(
      "engagements",
      meetingId,
      meetingData
    );
    return updatedMeeting;
  } catch (error) {
    console.error(
      `Error updating meeting ${meetingId}. Input: ${JSON.stringify(meetingData, null, 2)}`,
      error
    );
    throw normalizeError(error);
  }
};
