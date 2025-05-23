import { Client } from "@hubspot/api-client";
import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/contacts";
import { AssociationSpecAssociationCategoryEnum } from "@hubspot/api-client/lib/codegen/crm/objects/models/AssociationSpec";
import type { SimplePublicObject } from "@hubspot/api-client/lib/codegen/crm/objects/models/SimplePublicObject";
import type { SimplePublicObjectInputForCreate } from "@hubspot/api-client/lib/codegen/crm/objects/models/SimplePublicObjectInputForCreate";
import type { PublicOwner } from "@hubspot/api-client/lib/codegen/crm/owners/models/PublicOwner";
import type { Property } from "@hubspot/api-client/lib/codegen/crm/properties/models/Property";

const MAX_ENUM_OPTIONS_DISPLAYED = 50;
export const MAX_LIMIT = 50; // Hubspot API limit is 200 but it's too big for us.
export const MAX_COUNT_LIMIT = 10000; // Hubspot API limit.

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
 * Create an object from a list of properties.
 * The object will be created with the properties passed in the `objectProperties` parameter.
 */
export const createObject = async ({
  accessToken,
  objectType,
  objectProperties,
}: {
  accessToken: string;
  objectType: SimpleObjectType;
  objectProperties: SimplePublicObjectInputForCreate;
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });

  switch (objectType) {
    case "contacts":
      return hubspotClient.crm.contacts.basicApi.create(objectProperties);
    case "companies":
      return hubspotClient.crm.companies.basicApi.create(objectProperties);
    case "deals":
      return hubspotClient.crm.deals.basicApi.create(objectProperties);
    default:
      throw new Error(`Unsupported object type: ${objectType}`);
  }
};

/**
 * Update a contact.
 * The contact will be updated with the properties passed in the `contactProperties` parameter.
 */
export const updateObject = async ({
  accessToken,
  objectType,
  objectId,
  objectProperties,
}: {
  accessToken: string;
  objectType: SimpleObjectType;
  objectId: string;
  objectProperties: SimplePublicObjectInputForCreate;
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });

  switch (objectType) {
    case "contacts":
      return hubspotClient.crm.contacts.basicApi.update(
        objectId,
        objectProperties
      );
    case "companies":
      return hubspotClient.crm.companies.basicApi.update(
        objectId,
        objectProperties
      );
    case "deals":
      return hubspotClient.crm.deals.basicApi.update(
        objectId,
        objectProperties
      );
    default:
      throw new Error(`Unsupported object type: ${objectType}`);
  }
};

/**
 * Get an object by ID.
 * An object ID is unique, so there will only be zero or one object with a given ID.
 */
export const getObjectById = async (
  accessToken: string,
  objectType: SimpleObjectType | SpecialObjectType,
  objectId: string
): Promise<SimplePublicObject | PublicOwner | null> => {
  const hubspotClient = new Client({ accessToken });

  if (objectType === "owners") {
    const owner = await hubspotClient.crm.owners.ownersApi.getById(
      parseInt(objectId)
    );
    return owner;
  }

  const object = await hubspotClient.crm.objects.basicApi.getById(
    objectType,
    objectId
  );

  if (!object) {
    return null;
  }

  return object;
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

export const getObjectsByProperties = async (
  accessToken: string,
  objectType: SimpleObjectType,
  filters: Array<{
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

  const objects = await hubspotClient.crm[objectType].searchApi.doSearch({
    filterGroups: [
      {
        filters: buildHubspotFilters(filters),
      },
    ],
    properties: propertyNames,
    sorts: ["createdate:desc"],
    limit: MAX_LIMIT,
  });

  return objects.results;
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
  const objects = await hubspotClient.crm[objectType].searchApi.doSearch({
    filterGroups: [
      {
        filters: buildHubspotFilters(filters),
      },
    ],
    limit: 1, // We only need to know if there are any objects matching the filters.
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
 * Get the correct association type ID for associating an object with a deal.
 * @param fromObjectType The type of object being associated (e.g., "tasks", "notes")
 * @param toObjectType The type of object being associated to (e.g., "deals")
 * @returns The association type ID
 */
const getAssociationTypeId = async (
  accessToken: string,
  fromObjectType: string,
  toObjectType: string
): Promise<number> => {
  try {
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
      throw new Error(
        `Failed to fetch association types: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      throw new Error(
        `No association types found for ${fromObjectType} to ${toObjectType}`
      );
    }

    // Get the first association type (there should only be one for standard associations)
    const typeId = data.results[0].typeId;

    return typeId;
  } catch (error) {
    throw error;
  }
};

/**
 * Create a task associated with a deal.
 */
export const createTask = async ({
  accessToken,
  dealId,
  taskProperties,
}: {
  accessToken: string;
  dealId: string;
  taskProperties: {
    hs_timestamp: string;
    hs_task_subject: string;
    hs_task_body?: string;
    hs_task_status?: string;
    hs_task_priority?: string;
  };
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });

  // Get the association type ID
  const associationTypeId = await getAssociationTypeId(
    accessToken,
    "tasks",
    "deals"
  );

  // Create the task with the association to the deal
  const task = await hubspotClient.crm.objects.basicApi.create("tasks", {
    properties: {
      hs_timestamp: taskProperties.hs_timestamp,
      hs_task_subject: taskProperties.hs_task_subject,
      hs_task_body: taskProperties.hs_task_body || "",
      hs_task_status: taskProperties.hs_task_status || "NOT_STARTED",
      hs_task_priority: taskProperties.hs_task_priority || "MEDIUM",
    },
    associations: [
      {
        to: { id: dealId },
        types: [
          {
            associationCategory:
              AssociationSpecAssociationCategoryEnum.HubspotDefined,
            associationTypeId,
          },
        ],
      },
    ],
  });

  return task;
};

/**
 * Create a note associated with a deal.
 */
export const createNote = async ({
  accessToken,
  dealId,
  noteProperties,
}: {
  accessToken: string;
  dealId: string;
  noteProperties: {
    hs_note_body: string;
    hs_timestamp: string;
  };
}): Promise<SimplePublicObject> => {
  const hubspotClient = new Client({ accessToken });

  // Get the association type ID
  const associationTypeId = await getAssociationTypeId(
    accessToken,
    "notes",
    "deals"
  );

  const data = {
    properties: {
      hs_timestamp: noteProperties.hs_timestamp,
      hs_note_body: noteProperties.hs_note_body,
    },
    associations: [
      {
        to: { id: dealId },
        types: [
          {
            associationCategory:
              AssociationSpecAssociationCategoryEnum.HubspotDefined,
            associationTypeId,
          },
        ],
      },
    ],
  };

  // Create the note using the CRM API
  const note = await hubspotClient.crm.objects.basicApi.create("notes", data);

  return note;
};
