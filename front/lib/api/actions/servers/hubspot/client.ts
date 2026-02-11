import { Client } from "@hubspot/api-client";
import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/contacts";
import { AssociationSpecAssociationCategoryEnum } from "@hubspot/api-client/lib/codegen/crm/objects/models/AssociationSpec";
import type { SimplePublicObject } from "@hubspot/api-client/lib/codegen/crm/objects/models/SimplePublicObject";
import type { SimplePublicObjectInput } from "@hubspot/api-client/lib/codegen/crm/objects/models/SimplePublicObjectInput";
import type { SimplePublicObjectInputForCreate } from "@hubspot/api-client/lib/codegen/crm/objects/models/SimplePublicObjectInputForCreate";
import type { PublicOwner } from "@hubspot/api-client/lib/codegen/crm/owners/models/PublicOwner";
import type { Property } from "@hubspot/api-client/lib/codegen/crm/properties/models/Property";

import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const localLogger = logger.child({ module: "hubspot_client" });

const MAX_ENUM_OPTIONS_DISPLAYED = 50;
export const MAX_LIMIT = 200; // Hubspot API results are capped at 200, but this limit is set lower for internal use.
export const MAX_COUNT_LIMIT = 10000; // This is the Hubspot API limit for total count.

export const SIMPLE_OBJECTS = ["contacts", "companies", "deals"] as const;
type SimpleObjectType = (typeof SIMPLE_OBJECTS)[number];

const SPECIAL_OBJECTS = ["owners"] as const;
type SpecialObjectType = (typeof SPECIAL_OBJECTS)[number];

export const ALL_OBJECTS = [...SIMPLE_OBJECTS, ...SPECIAL_OBJECTS] as const;

interface HubspotFilter {
  propertyName: string;
  operator: FilterOperatorEnum;
  value?: string;
  values?: string[];
  highValue?: string;
}

type HubspotSearchRequest = {
  filterGroups: Array<{
    filters: HubspotFilter[];
  }>;
  limit: number;
  properties: string[];
  after?: string;
  sorts?: string[];
  query?: string;
};

const getPropertyTypes = async (
  hubspotClient: Client,
  objectType: string
): Promise<Record<string, string>> => {
  const properties =
    await hubspotClient.crm.properties.coreApi.getAll(objectType);
  return properties.results.reduce(
    (acc, prop) => {
      acc[prop.name] = prop.type;
      return acc;
    },
    {} as Record<string, string>
  );
};

const isEnumerationProperty = (
  propertyName: string,
  propertyTypes?: Record<string, string>
) => propertyTypes?.[propertyName] === "enumeration";

const isDateProperty = (
  propertyName: string,
  propertyTypes?: Record<string, string>
): boolean => {
  // If we have property type metadata, use it (most reliable).
  if (propertyTypes?.[propertyName]) {
    const type = propertyTypes[propertyName];
    return type === "date" || type === "datetime";
  }

  // Fallback to name-based detection.
  return (
    propertyName.includes("date") ||
    propertyName.includes("time") ||
    propertyName.includes("timestamp") ||
    propertyName === "createdate" ||
    propertyName === "lastmodifieddate" ||
    propertyName === "hs_lastmodifieddate"
  );
};

function buildHubspotFilters(
  filters: Array<HubspotFilter>,
  propertyTypes?: Record<string, string>
) {
  // Define supported operators for validation
  const supportedOperators = [
    FilterOperatorEnum.Eq,
    FilterOperatorEnum.Neq,
    FilterOperatorEnum.Lt,
    FilterOperatorEnum.Lte,
    FilterOperatorEnum.Gt,
    FilterOperatorEnum.Gte,
    FilterOperatorEnum.Between,
    FilterOperatorEnum.In,
    FilterOperatorEnum.NotIn,
    FilterOperatorEnum.HasProperty,
    FilterOperatorEnum.NotHasProperty,
    FilterOperatorEnum.ContainsToken,
    FilterOperatorEnum.NotContainsToken,
  ];

  return filters.map(({ propertyName, operator, value, values }) => {
    // Validate operator is supported
    if (!supportedOperators.includes(operator)) {
      throw new Error(
        `Unsupported filter operator: ${operator}. Supported operators: ${supportedOperators.join(", ")}`
      );
    }

    const filter: HubspotFilter = {
      propertyName,
      operator,
    };

    // Only include value/values if it's not a HAS_PROPERTY or NOT_HAS_PROPERTY operator
    if (
      operator !== FilterOperatorEnum.HasProperty &&
      operator !== FilterOperatorEnum.NotHasProperty
    ) {
      // Handle operators that require values array
      if (
        operator === FilterOperatorEnum.In ||
        operator === FilterOperatorEnum.NotIn
      ) {
        // For string properties, values must be lowercase, but not for date or enumeration properties
        if (values?.length) {
          // Check if this is a date or enumeration property that should preserve case
          const isDateProp = isDateProperty(propertyName, propertyTypes);
          const isEnumProperty = isEnumerationProperty(
            propertyName,
            propertyTypes
          );

          // Filter out any undefined/null values and ensure all values are strings
          const cleanValues = values
            .filter((v) => v !== undefined && v !== null)
            .map((v) => String(v));
          filter.values =
            isDateProp || isEnumProperty
              ? cleanValues
              : cleanValues.map((v) => v.toLowerCase());
        } else {
          throw new Error(`Values array is required for ${operator} operator`);
        }
      } else if (operator === FilterOperatorEnum.Between) {
        // Date properties need to be converted to Unix timestamps in milliseconds
        const isDateProp = isDateProperty(propertyName, propertyTypes);

        if (values?.length === 2) {
          let cleanValues = values
            .filter((v) => v !== undefined && v !== null)
            .map((v) => String(v));

          // Convert date strings to timestamps for date properties
          if (isDateProp) {
            cleanValues = cleanValues.map((dateStr) => {
              // Check if it's already a timestamp (all digits)
              if (/^\d+$/.test(dateStr)) {
                return dateStr;
              }
              // Convert ISO date string to timestamp
              const timestamp = new Date(dateStr).getTime();
              if (isNaN(timestamp)) {
                throw new Error(
                  `Invalid date format for BETWEEN operator: ${dateStr}`
                );
              }
              return String(timestamp);
            });
          }

          filter.value = cleanValues[0];
          filter.highValue = cleanValues[1];
        } else if (value !== undefined && value !== null) {
          // If single value provided, assume it's semicolon-separated
          const parts = String(value).split(";");
          if (parts.length === 2) {
            let [lowValue, highValue] = parts;

            // Convert date strings to timestamps for date properties
            if (isDateProp) {
              if (!/^\d+$/.test(lowValue)) {
                const timestamp = new Date(lowValue).getTime();
                if (isNaN(timestamp)) {
                  throw new Error(
                    `Invalid date format for BETWEEN operator: ${lowValue}`
                  );
                }
                lowValue = String(timestamp);
              }
              if (!/^\d+$/.test(highValue)) {
                const timestamp = new Date(highValue).getTime();
                if (isNaN(timestamp)) {
                  throw new Error(
                    `Invalid date format for BETWEEN operator: ${highValue}`
                  );
                }
                highValue = String(timestamp);
              }
            }

            filter.value = lowValue;
            filter.highValue = highValue;
          } else {
            throw new Error(
              `BETWEEN operator with single value requires semicolon-separated format (e.g., "100;200")`
            );
          }
        } else {
          throw new Error(
            `BETWEEN operator requires either a values array with 2 elements or a semicolon-separated value string`
          );
        }
      } else {
        // Handle all single-value operators: EQ, NEQ, LT, LTE, GT, GTE, CONTAINS_TOKEN, NOT_CONTAINS_TOKEN
        if (value !== undefined && value !== null) {
          // Check if this is a date or enumeration property that should preserve case
          const isDateProp = isDateProperty(propertyName, propertyTypes);
          const isEnumProperty = isEnumerationProperty(
            propertyName,
            propertyTypes
          );

          const stringValue = String(value);
          // For string comparison operators, lowercase non-date, non-enumeration values for consistency
          if (
            !isDateProp &&
            !isEnumProperty &&
            (operator === FilterOperatorEnum.Eq ||
              operator === FilterOperatorEnum.Neq ||
              operator === FilterOperatorEnum.ContainsToken ||
              operator === FilterOperatorEnum.NotContainsToken)
          ) {
            filter.value = stringValue.toLowerCase();
          } else {
            filter.value = stringValue;
          }
        } else {
          throw new Error(`Value is required for ${operator} operator`);
        }
      }
    }
    return filter;
  });
}

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

const getAllOwners = async (accessToken: string): Promise<PublicOwner[]> => {
  const hubspotClient = new Client({ accessToken });
  const allOwners: PublicOwner[] = [];
  let after: string | undefined = undefined;
  let hasMore = true;

  while (hasMore) {
    const owners = await hubspotClient.crm.owners.ownersApi.getPage(
      undefined, // email
      after, // after for pagination
      100, // limit (max 100 per page)
      undefined // archived
    );

    allOwners.push(...owners.results);

    if (owners.paging?.next?.after) {
      after = owners.paging.next.after;
    } else {
      hasMore = false;
    }
  }

  return allOwners;
};

const getOwnerByEmail = async (
  accessToken: string,
  email: string
): Promise<PublicOwner | null> => {
  const hubspotClient = new Client({ accessToken });

  // The getPage method can filter by email directly
  const owners = await hubspotClient.crm.owners.ownersApi.getPage(
    email, // email filter
    undefined, // after
    1, // limit - we only need one
    undefined // archived
  );

  return owners.results.length > 0 ? owners.results[0] : null;
};

export const getObjectByEmail = async (
  accessToken: string,
  objectType: SimpleObjectType | SpecialObjectType,
  email: string
): Promise<SimplePublicObject | PublicOwner | null> => {
  const hubspotClient = new Client({ accessToken });

  if (objectType === "owners") {
    return getOwnerByEmail(accessToken, email);
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

export const listOwners = async (
  accessToken: string
): Promise<
  {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    userId: number | null;
    archived: boolean;
  }[]
> => {
  const allOwners = await getAllOwners(accessToken);

  return allOwners.map((owner) => ({
    id: owner.id,
    email: owner.email ?? null,
    firstName: owner.firstName ?? null,
    lastName: owner.lastName ?? null,
    userId: owner.userId ?? null,
    archived: owner.archived ?? false,
  }));
};

export const searchOwners = async (
  accessToken: string,
  searchQuery: string
): Promise<
  {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    userId: number | null;
    archived: boolean;
  }[]
> => {
  const allOwners = await getAllOwners(accessToken);
  const query = searchQuery.toLowerCase();

  const filteredOwners = allOwners.filter((owner) => {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const emailMatch = owner.email?.toLowerCase().includes(query) || false;
    const firstNameMatch =
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      owner.firstName?.toLowerCase().includes(query) || false;
    const lastNameMatch =
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      owner.lastName?.toLowerCase().includes(query) || false;
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const fullNameMatch = `${owner.firstName || ""} ${owner.lastName || ""}`
      .toLowerCase()
      .includes(query);
    const idMatch = owner.id === searchQuery; // Exact match for ID
    const userIdMatch = owner.userId?.toString() === searchQuery; // Exact match for userId

    return (
      emailMatch ||
      firstNameMatch ||
      lastNameMatch ||
      fullNameMatch ||
      idMatch ||
      userIdMatch
    );
  });

  return filteredOwners.map((owner) => ({
    id: owner.id,
    email: owner.email ?? null,
    firstName: owner.firstName ?? null,
    lastName: owner.lastName ?? null,
    userId: owner.userId ?? null,
    archived: owner.archived ?? false,
  }));
};

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

  // Fetch property types for enumeration detection
  const propertyTypes = await getPropertyTypes(hubspotClient, objectType);

  // First, get the total count with a minimal request
  const initialSearch = await hubspotClient.crm[objectType].searchApi.doSearch({
    filterGroups: [
      {
        filters: buildHubspotFilters(filters, propertyTypes),
      },
    ],
    limit: 1,
    properties: ["id"],
  });

  // If the total is at the API limit, we need to paginate to get the actual count
  if (initialSearch.total === MAX_COUNT_LIMIT) {
    // Count by paginating through all results
    let actualCount = 0;
    let after: string | undefined = undefined;
    let hasMoreResults = true;

    while (hasMoreResults) {
      const searchRequest: HubspotSearchRequest = {
        filterGroups: [
          {
            filters: buildHubspotFilters(filters, propertyTypes),
          },
        ],
        limit: MAX_LIMIT,
        properties: ["id"],
      };

      if (after) {
        searchRequest.after = after;
      }

      const response =
        await hubspotClient.crm[objectType].searchApi.doSearch(searchRequest);
      actualCount += response.results.length;

      if (!response.paging?.next?.after) {
        hasMoreResults = false;
      } else {
        after = response.paging.next.after;
      }
    }

    return actualCount;
  }

  return initialSearch.total;
};

export const getLatestObjects = async (
  accessToken: string,
  objectType: SimpleObjectType,
  limit: number,
  filters?: Array<{
    propertyName: string;
    operator: FilterOperatorEnum;
    value?: string;
    values?: string[];
  }>
): Promise<SimplePublicObject[]> => {
  const hubspotClient = new Client({ accessToken });

  const availableProperties =
    await hubspotClient.crm.properties.coreApi.getAll(objectType);
  const propertyNames = availableProperties.results.map((p) => p.name);
  const propertyTypes = await getPropertyTypes(hubspotClient, objectType);

  const allResults: SimplePublicObject[] = [];
  let after: string | undefined = undefined;

  // Build filter groups if filters are provided
  const filterGroups =
    filters && filters.length > 0
      ? [{ filters: buildHubspotFilters(filters, propertyTypes) }]
      : [];

  while (allResults.length < limit) {
    const searchRequest: HubspotSearchRequest = {
      filterGroups,
      properties: propertyNames,
      sorts: ["-createdate"],
      limit: Math.min(limit - allResults.length, MAX_LIMIT),
    };

    if (after) {
      searchRequest.after = after;
    }

    const response =
      await hubspotClient.crm[objectType].searchApi.doSearch(searchRequest);
    allResults.push(...response.results);

    // If we've retrieved enough results or there are no more pages, stop
    if (allResults.length >= limit || !response.paging?.next?.after) {
      break;
    }

    after = response.paging.next.after;
  }

  // Return only the requested number of results
  return allResults.slice(0, limit);
};

const getAssociationTypeId = async (
  accessToken: string,
  fromObjectType: string,
  toObjectType: string
): Promise<number> => {
  // eslint-disable-next-line no-restricted-globals
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
  return data.results[0].typeId;
};

export const createContact = async ({
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
        "contacts",
        assoc.toObjectType
      );
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

  const contactData: SimplePublicObjectInputForCreate = {
    properties,
    associations: builtAssociations,
  };

  return hubspotClient.crm.contacts.basicApi.create(contactData);
};

export const createCompany = async ({
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
        "companies",
        assoc.toObjectType
      );
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

  const companyData: SimplePublicObjectInputForCreate = {
    properties,
    associations: builtAssociations,
  };

  return hubspotClient.crm.companies.basicApi.create(companyData);
};

export const createDeal = async ({
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
        "deals",
        assoc.toObjectType
      );
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

  const dealData: SimplePublicObjectInputForCreate = {
    properties,
    associations: builtAssociations,
  };

  return hubspotClient.crm.deals.basicApi.create(dealData);
};

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
  };
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });

  const propertiesForApi = { ...properties };

  if (!propertiesForApi.hs_note_body) {
    throw normalizeError(
      new Error("hs_note_body is required to create a note.")
    );
  }

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  if (!propertiesForApi.hs_timestamp) {
    propertiesForApi.hs_timestamp = new Date().toISOString();
  }

  const builtAssociations: SimplePublicObjectInputForCreate["associations"] =
    [];

  if (associations) {
    const associationMappings = [
      { ids: associations.contactIds, toObjectType: "contacts" },
      { ids: associations.companyIds, toObjectType: "companies" },
      { ids: associations.dealIds, toObjectType: "deals" },
      { ids: associations.ownerIds, toObjectType: "owners" },
    ];

    for (const mapping of associationMappings) {
      if (mapping.ids && mapping.ids.length > 0) {
        const associationTypeId = await getAssociationTypeId(
          accessToken,
          "notes",
          mapping.toObjectType
        );
        for (const id of mapping.ids) {
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
    localLogger.error(
      { error, noteInput, function: "createNote" },
      `Error creating note.`
    );
    throw normalizeError(error);
  }
};

export const createLead = async ({
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
        "deals",
        assoc.toObjectType
      );
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

  const leadData: SimplePublicObjectInputForCreate = {
    properties,
    associations: builtAssociations,
  };

  return hubspotClient.crm.deals.basicApi.create(leadData);
};

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
  const taskData: SimplePublicObjectInputForCreate = {
    properties,
    associations: builtAssociations,
  };
  return hubspotClient.crm.objects.basicApi.create("tasks", taskData);
};

export const createCommunication = async ({
  accessToken,
  properties,
  associations,
}: {
  accessToken: string;
  properties: Record<string, any>;
  associations?: {
    contactIds?: string[];
    companyIds?: string[];
    dealIds?: string[];
  };
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });

  const finalProperties = { ...properties };

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  if (!finalProperties.hs_engagement_type) {
    finalProperties.hs_engagement_type = "COMMUNICATION";
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
    ];
    for (const mapping of associationMappings) {
      if (mapping.ids && mapping.ids.length > 0) {
        const associationTypeId = await getAssociationTypeId(
          accessToken,
          "engagements",
          mapping.toObjectType
        );
        for (const id of mapping.ids) {
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
    localLogger.error(
      { error, communicationData, function: "createCommunication" },
      `Error creating communication (engagement type: ${finalProperties.hs_engagement_type}, channel: ${finalProperties.hs_communication_channel_type}).`
    );
    throw normalizeError(error);
  }
};

export const createMeeting = async ({
  accessToken,
  properties,
  associations,
}: {
  accessToken: string;
  properties: Record<string, any>;
  associations?: {
    contactIds?: string[];
    companyIds?: string[];
    dealIds?: string[];
  };
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });

  const finalProperties = { ...properties };

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  if (!finalProperties.hs_engagement_type) {
    finalProperties.hs_engagement_type = "MEETING";
  }

  const builtAssociations: SimplePublicObjectInputForCreate["associations"] =
    [];
  if (associations) {
    const associationMappings = [
      { ids: associations.contactIds, toObjectType: "contacts" },
      { ids: associations.companyIds, toObjectType: "companies" },
      { ids: associations.dealIds, toObjectType: "deals" },
    ];
    for (const mapping of associationMappings) {
      if (mapping.ids && mapping.ids.length > 0) {
        const associationTypeId = await getAssociationTypeId(
          accessToken,
          "engagements",
          mapping.toObjectType
        );
        for (const id of mapping.ids) {
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
    localLogger.error(
      { error, meetingInput, function: "createMeeting" },
      `Error creating meeting engagement (type: ${finalProperties.hs_engagement_type}).`
    );
    throw normalizeError(error);
  }
};

export const getContact = async (
  accessToken: string,
  contactId: string
): Promise<SimplePublicObject | null> => {
  const hubspotClient = new Client({ accessToken });
  try {
    const contact =
      await hubspotClient.crm.contacts.basicApi.getById(contactId);
    return contact;
  } catch (error: any) {
    if (error.code === 404) {
      return null;
    }
    localLogger.error(
      { error, contactId },
      `Error fetching contact ${contactId}:`
    );
    throw normalizeError(error);
  }
};

export const getCompany = async (
  accessToken: string,
  companyId: string,
  extraProperties?: string[]
): Promise<SimplePublicObject | null> => {
  const hubspotClient = new Client({ accessToken });
  try {
    const defaultProperties = [
      "createdate",
      "domain",
      "name",
      "hubspot_owner_id",
    ];
    const company = await hubspotClient.crm.companies.basicApi.getById(
      companyId,
      extraProperties
        ? [...defaultProperties, ...extraProperties]
        : defaultProperties
    );
    return company;
  } catch (error: any) {
    if (error.code === 404) {
      return null;
    }
    localLogger.error(
      { error, companyId },
      `Error fetching company ${companyId}:`
    );
    throw normalizeError(error);
  }
};

export const getDeal = async (
  accessToken: string,
  dealId: string,
  extraProperties?: string[]
): Promise<SimplePublicObject | null> => {
  const hubspotClient = new Client({ accessToken });
  try {
    const defaultProperties = [
      "amount",
      "hubspot_owner_id",
      "closedate",
      "createdate",
      "dealname",
      "dealstage",
      "hs_lastmodifieddate",
      "hs_object_id",
      "pipeline",
    ];
    const deal = await hubspotClient.crm.deals.basicApi.getById(
      dealId,
      extraProperties
        ? [...defaultProperties, ...extraProperties]
        : defaultProperties
    );
    return deal;
  } catch (error: any) {
    if (error.code === 404) {
      return null;
    }
    localLogger.error({ error, dealId }, `Error fetching deal ${dealId}:`);
    throw normalizeError(error);
  }
};

export const getMeeting = async (
  accessToken: string,
  meetingId: string
): Promise<SimplePublicObject | null> => {
  const hubspotClient = new Client({ accessToken });
  try {
    const meeting = await hubspotClient.crm.objects.basicApi.getById(
      "engagements",
      meetingId
    );
    return meeting;
  } catch (error: any) {
    if (error.code === 404) {
      return null;
    }
    localLogger.error(
      { error, meetingId },
      `Error fetching meeting (engagement) ${meetingId}:`
    );
    throw normalizeError(error);
  }
};

export const getFilePublicUrl = async (
  accessToken: string,
  fileId: string
): Promise<string | null> => {
  const hubspotClient = new Client({ accessToken });
  try {
    const file = await hubspotClient.files.filesApi.getById(fileId);

    if (file && file.url) {
      return file.url;
    } else if (file) {
      localLogger.warn(
        { fileId },
        `File ${fileId} found, but it does not have a public URL property.`
      );
      try {
        const signedUrlResponse =
          await hubspotClient.files.filesApi.getSignedUrl(fileId);
        if (signedUrlResponse && signedUrlResponse.url) {
          return signedUrlResponse.url;
        }
      } catch (signedUrlError) {
        localLogger.warn(
          { signedUrlError },
          `Could not get signed URL for file ${fileId}:`
        );
      }
      return null;
    } else {
      return null;
    }
  } catch (error: any) {
    if (error.code === 404) {
      localLogger.warn({ fileId }, `File ${fileId} not found.`);
      return null;
    }
    localLogger.error(
      { error, fileId },
      `Error fetching file ${fileId} public URL:`
    );
    throw normalizeError(error);
  }
};

export const getAssociatedMeetings = async (
  accessToken: string,
  fromObjectType: "contacts" | "companies" | "deals",
  fromObjectId: string
): Promise<SimplePublicObject[] | null> => {
  const hubspotClient = new Client({ accessToken });
  const associatedMeetingDetails: SimplePublicObject[] = [];
  const toObjectType = "meetings";

  try {
    const associationResults =
      await hubspotClient.crm.associations.v4.basicApi.getPage(
        fromObjectType,
        fromObjectId,
        toObjectType
      );

    const meetingIds = associationResults.results.map(
      (assoc) => assoc.toObjectId
    );

    for (const meetingId of meetingIds) {
      const meetingDetail = await getMeeting(accessToken, meetingId);
      if (
        meetingDetail &&
        meetingDetail.properties?.hs_engagement_type === "MEETING"
      ) {
        associatedMeetingDetails.push(meetingDetail);
      } else if (meetingDetail) {
        localLogger.warn(
          { meetingId },
          `Associated engagement ${meetingId} is not of type MEETING (type: ${meetingDetail.properties?.hs_engagement_type}). Skipping.`
        );
      }
    }
    return associatedMeetingDetails;
  } catch (error: any) {
    if (error.code === 404) {
      localLogger.warn(
        { fromObjectType, fromObjectId },
        `Error 404 when fetching associated meetings for ${fromObjectType}/${fromObjectId} to ${toObjectType}. This might mean the object does not exist or no such associations exist.`
      );
      return [];
    }
    localLogger.error(
      { error, fromObjectType, fromObjectId },
      `Error fetching associated meetings for ${fromObjectType}/${fromObjectId}:`
    );
    throw normalizeError(error);
  }
};

export const searchCrmObjects = async ({
  accessToken,
  objectType,
  filters,
  query,
  propertiesToReturn,
  limit = MAX_LIMIT,
  after,
}: {
  accessToken: string;
  objectType:
    | SimpleObjectType
    | "tasks"
    | "notes"
    | "meetings"
    | "calls"
    | "emails"
    | "line_items"
    | "quotes"
    | "feedback_submissions"
    | "products";
  filters?: Array<HubspotFilter>;
  query?: string;
  propertiesToReturn?: string[];
  limit?: number;
  after?: string;
}): Promise<{ results: SimplePublicObject[]; paging?: any } | null> => {
  const hubspotClient = new Client({ accessToken });

  let propertyTypes: Record<string, string> = {};
  let finalPropertiesToReturn = propertiesToReturn;

  try {
    const allProps =
      await hubspotClient.crm.properties.coreApi.getAll(objectType);
    propertyTypes = await getPropertyTypes(hubspotClient, objectType);

    if (!finalPropertiesToReturn || finalPropertiesToReturn.length === 0) {
      finalPropertiesToReturn = allProps.results.map((p) => p.name);
    }
  } catch (propError) {
    localLogger.error(
      { propError },
      `Error fetching properties for ${objectType}:`
    );
    if (!finalPropertiesToReturn || finalPropertiesToReturn.length === 0) {
      finalPropertiesToReturn = [];
    }
  }

  const searchRequest: HubspotSearchRequest = {
    filterGroups: filters
      ? [{ filters: buildHubspotFilters(filters, propertyTypes) }]
      : [],
    sorts: ["-createdate"],
    properties: finalPropertiesToReturn,
    limit: Math.min(limit, MAX_LIMIT),
    after: after,
  };

  if (query) {
    searchRequest.query = query;
  }

  try {
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
      case "tasks":
        searchResponse =
          await hubspotClient.crm.objects.tasks.searchApi.doSearch(
            searchRequest
          );
        break;
      case "notes":
        searchResponse =
          await hubspotClient.crm.objects.notes.searchApi.doSearch(
            searchRequest
          );
        break;
      case "meetings":
        searchResponse =
          await hubspotClient.crm.objects.meetings.searchApi.doSearch(
            searchRequest
          );
        break;
      case "calls":
        searchResponse =
          await hubspotClient.crm.objects.calls.searchApi.doSearch(
            searchRequest
          );
        break;
      case "emails":
        searchResponse =
          await hubspotClient.crm.objects.emails.searchApi.doSearch(
            searchRequest
          );
        break;
      case "products":
        searchResponse =
          await hubspotClient.crm.products.searchApi.doSearch(searchRequest);
        break;
      case "line_items":
        searchResponse =
          await hubspotClient.crm.lineItems.searchApi.doSearch(searchRequest);
        break;
      case "quotes":
        searchResponse =
          await hubspotClient.crm.quotes.searchApi.doSearch(searchRequest);
        break;
      case "feedback_submissions":
        searchResponse =
          await hubspotClient.crm.objects.feedbackSubmissions.searchApi.doSearch(
            searchRequest
          );
        break;
      default:
        throw new Error(
          `Search for object type "${objectType}" is not explicitly implemented. Add to switch.`
        );
    }

    return {
      results: searchResponse.results,
      paging: searchResponse.paging,
    };
  } catch (error: any) {
    if (error.code === 404) {
      localLogger.warn(
        { objectType, filters, query },
        `Error 404 when searching ${objectType}. Returning empty results.`
      );
      return { results: [], paging: undefined };
    }
    localLogger.error({ error }, `Error searching ${objectType}:`);
    throw normalizeError(error);
  }
};

function createDateRangeFilters(
  startDate: string,
  endDate: string,
  dateProperty = "createdate"
): HubspotFilter[] {
  const startTimestamp = isNaN(Number(startDate))
    ? new Date(startDate).getTime()
    : Number(startDate);
  const endTimestamp = isNaN(Number(endDate))
    ? new Date(endDate).getTime()
    : Number(endDate);

  return [
    {
      propertyName: dateProperty,
      operator: FilterOperatorEnum.Gte,
      value: startTimestamp.toString(),
    },
    {
      propertyName: dateProperty,
      operator: FilterOperatorEnum.Lte,
      value: endTimestamp.toString(),
    },
  ];
}

function createOwnerFilter(
  ownerId: string,
  ownerProperty = "hubspot_owner_id"
): HubspotFilter {
  return {
    propertyName: ownerProperty,
    operator: FilterOperatorEnum.Eq,
    value: ownerId,
  };
}

export const getUserActivity = async ({
  accessToken,
  ownerId,
  startDate,
  endDate,
  limit = MAX_LIMIT,
}: {
  accessToken: string;
  ownerId: string;
  startDate: string;
  endDate: string;
  limit?: number;
}) => {
  try {
    const engagementTypes = ["tasks", "notes", "meetings", "calls", "emails"];
    const allActivities: Array<SimplePublicObject & { objectType: string }> =
      [];

    const dateFilters = createDateRangeFilters(startDate, endDate);

    for (const objectType of engagementTypes) {
      try {
        const ownerPropertyNames = [
          "hubspot_owner_id",
          "hs_created_by",
          "hs_created_by_user_id",
        ];
        let result = null;

        for (const ownerProperty of ownerPropertyNames) {
          try {
            const ownerFilter = createOwnerFilter(ownerId, ownerProperty);
            result = await searchCrmObjects({
              accessToken,
              objectType: objectType as any,
              filters: [ownerFilter, ...dateFilters],
              limit,
            });
            if (result?.results && result.results.length > 0) {
              break;
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
          } catch (propertyError) {
            continue;
          }
        }

        if (result?.results) {
          allActivities.push(
            ...result.results.map((activity) => ({
              ...activity,
              objectType,
            }))
          );
        }
      } catch (error) {
        localLogger.warn(
          { error, objectType, ownerId },
          `Failed to get ${objectType} for owner ${ownerId}, continuing with other types`
        );
        continue;
      }
    }

    // Sort by creation date (most recent first)
    allActivities.sort((a, b) => {
      const aDate = new Date(
        a.createdAt || a.properties?.createdate || 0
      ).getTime();
      const bDate = new Date(
        b.createdAt || b.properties?.createdate || 0
      ).getTime();
      return bDate - aDate;
    });

    return {
      results: allActivities.slice(0, limit),
      summary: {
        totalActivities: allActivities.length,
        byType: engagementTypes.reduce(
          (acc, type) => {
            acc[type] = allActivities.filter(
              (a) => a.objectType === type
            ).length;
            return acc;
          },
          {} as Record<string, number>
        ),
        dateRange: {
          start: startDate,
          end: endDate,
        },
      },
    };
  } catch (error) {
    localLogger.error(
      { error, ownerId, startDate, endDate },
      `Error getting user activity for owner ${ownerId}:`
    );
    throw normalizeError(error);
  }
};

export const getCurrentUserId = async (accessToken: string) => {
  try {
    const userDetails = await getUserDetails(accessToken);
    return {
      userId: userDetails.user_id,
      user: userDetails.user,
      hubId: userDetails.hub_id,
    };
  } catch (error) {
    localLogger.error({ error }, "Error getting current user ID:");
    throw normalizeError(error);
  }
};

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

  const updateInput: SimplePublicObjectInput = {
    properties,
  };

  try {
    const result = await hubspotClient.crm.contacts.basicApi.update(
      contactId,
      updateInput
    );

    return result;
  } catch (error) {
    localLogger.error(
      { error, contactId },
      `Error updating contact with ID ${contactId}:`
    );
    throw normalizeError(error);
  }
};

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

  const updateInput: SimplePublicObjectInput = {
    properties,
  };

  try {
    const result = await hubspotClient.crm.companies.basicApi.update(
      companyId,
      updateInput
    );

    return result;
  } catch (error) {
    localLogger.error(
      { error, companyId },
      `Error updating company with ID ${companyId}:`
    );
    throw normalizeError(error);
  }
};

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

  const updateInput: SimplePublicObjectInput = {
    properties,
  };

  try {
    const result = await hubspotClient.crm.deals.basicApi.update(
      dealId,
      updateInput
    );

    return result;
  } catch (error) {
    localLogger.error(
      { error, dealId },
      `Error updating deal with ID ${dealId}:`
    );
    throw normalizeError(error);
  }
};

export const getUserDetails = async (accessToken: string) => {
  try {
    // eslint-disable-next-line no-restricted-globals
    const response = await fetch(
      `https://api.hubapi.com/oauth/v1/access-tokens/${accessToken}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    return {
      user_id: data.user_id,
      user: data.user,
      hub_id: data.hub_id,
    };
  } catch (error) {
    localLogger.error({ error }, "Error getting user details:");
    throw normalizeError(error);
  }
};

export const createAssociation = async ({
  accessToken,
  fromObjectType,
  fromObjectId,
  toObjectType,
  toObjectId,
}: {
  accessToken: string;
  fromObjectType: string;
  fromObjectId: string;
  toObjectType: string;
  toObjectId: string;
}) => {
  try {
    const hubspotClient = new Client({ accessToken });

    const result = await hubspotClient.crm.associations.v4.basicApi.create(
      fromObjectType,
      fromObjectId,
      toObjectType,
      toObjectId,
      [
        {
          associationCategory:
            AssociationSpecAssociationCategoryEnum.HubspotDefined,
          associationTypeId: 1,
        },
      ]
    );

    return result;
  } catch (error) {
    localLogger.error(
      { error, fromObjectType, fromObjectId, toObjectType, toObjectId },
      `Error creating association between ${fromObjectType}:${fromObjectId} and ${toObjectType}:${toObjectId}:`
    );
    throw normalizeError(error);
  }
};

export const listAssociations = async ({
  accessToken,
  objectType,
  objectId,
  toObjectType,
}: {
  accessToken: string;
  objectType: string;
  objectId: string;
  toObjectType?: string;
}) => {
  try {
    const hubspotClient = new Client({ accessToken });

    if (toObjectType) {
      const result = await hubspotClient.crm.associations.v4.basicApi.getPage(
        objectType,
        objectId,
        toObjectType
      );
      return result;
    } else {
      const associationTypes = [
        "contacts",
        "companies",
        "deals",
        "tasks",
        "notes",
      ];
      const allAssociations = [];

      for (const targetType of associationTypes) {
        if (targetType !== objectType) {
          try {
            const result =
              await hubspotClient.crm.associations.v4.basicApi.getPage(
                objectType,
                objectId,
                targetType
              );
            if (result.results && result.results.length > 0) {
              allAssociations.push({
                toObjectType: targetType,
                associations: result.results,
              });
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
          } catch (error) {
            continue;
          }
        }
      }

      return { results: allAssociations };
    }
  } catch (error) {
    localLogger.error(
      { error, objectType, objectId, toObjectType },
      `Error listing associations for ${objectType}:${objectId}:`
    );
    throw normalizeError(error);
  }
};

export const removeAssociation = async ({
  accessToken,
  fromObjectType,
  fromObjectId,
  toObjectType,
  toObjectId,
}: {
  accessToken: string;
  fromObjectType: string;
  fromObjectId: string;
  toObjectType: string;
  toObjectId: string;
}) => {
  try {
    const hubspotClient = new Client({ accessToken });

    const result = await hubspotClient.crm.associations.v4.basicApi.archive(
      fromObjectType,
      fromObjectId,
      toObjectType,
      toObjectId
    );

    return result;
  } catch (error) {
    localLogger.error(
      { error, fromObjectType, fromObjectId, toObjectType, toObjectId },
      `Error removing association between ${fromObjectType}:${fromObjectId} and ${toObjectType}:${toObjectId}:`
    );
    throw normalizeError(error);
  }
};
