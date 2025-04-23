import { Client } from "@hubspot/api-client";
import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/contacts";
import type { SimplePublicObject } from "@hubspot/api-client/lib/codegen/crm/objects/models/SimplePublicObject";
import type { SimplePublicObjectInputForCreate } from "@hubspot/api-client/lib/codegen/crm/objects/models/SimplePublicObjectInputForCreate";
import type { PublicOwner } from "@hubspot/api-client/lib/codegen/crm/owners/models/PublicOwner";
import type { Property } from "@hubspot/api-client/lib/codegen/crm/properties/models/Property";

const MAX_ENUM_OPTIONS_DISPLAYED = 10;
export const SUPPORTED_OBJECT_TYPES_WRITE = [
  "contacts",
  "companies",
  "deals",
] as const;
type SupportedObjectTypeWrite = (typeof SUPPORTED_OBJECT_TYPES_WRITE)[number];

export const SUPPORTED_OBJECT_TYPES_READ = [
  ...SUPPORTED_OBJECT_TYPES_WRITE,
  "owners",
] as const;
type SupportedObjectTypeRead = (typeof SUPPORTED_OBJECT_TYPES_READ)[number];

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
  objectType: SupportedObjectTypeRead;
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
  objectType: SupportedObjectTypeWrite;
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
  objectType: SupportedObjectTypeWrite;
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
  objectType: SupportedObjectTypeRead,
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
  objectType: SupportedObjectTypeRead,
  email: string
): Promise<SimplePublicObject | PublicOwner | null> => {
  const hubspotClient = new Client({ accessToken });

  if (objectType === "owners") {
    const owners = await hubspotClient.crm.owners.ownersApi.getPage();
    const owner = owners.results.find((owner) => owner.email === email);
    if (owner) {
      return owner;
    }
  }

  const properties =
    await hubspotClient.crm.properties.coreApi.getAll(objectType);
  const propertyNames = properties.results.map((p) => p.name);

  const object = await hubspotClient.crm.contacts.searchApi.doSearch({
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
  });

  if (object.results.length === 0) {
    return null;
  }

  return object.results[0];
};

/**
 * Get a contact by name.
 * A name is not unique, so there may be multiple contacts with the same name.
 */
export const getContactsByName = async (
  accessToken: string,
  firstname: string | undefined,
  lastname: string
): Promise<SimplePublicObject[]> => {
  const hubspotClient = new Client({ accessToken });

  // First get all available properties.
  const properties =
    await hubspotClient.crm.properties.coreApi.getAll("contacts");
  const propertyNames = properties.results.map((p) => p.name);

  const filters = [
    {
      propertyName: "lastname",
      operator: FilterOperatorEnum.ContainsToken,
      value: lastname,
    },
  ];

  if (firstname) {
    filters.push({
      propertyName: "firstname",
      operator: FilterOperatorEnum.ContainsToken,
      value: firstname,
    });
  }

  const contacts = await hubspotClient.crm.contacts.searchApi.doSearch({
    filterGroups: [
      {
        filters,
      },
    ],
    properties: propertyNames,
  });

  return contacts.results;
};

/**
 * Get a contact by email.
 * A email is unique, so there will only be zero or one contact with a given email.
 */
export const getCompaniesByName = async (
  accessToken: string,
  name: string
): Promise<SimplePublicObject[]> => {
  const hubspotClient = new Client({ accessToken });

  // First get all available properties.
  const properties =
    await hubspotClient.crm.properties.coreApi.getAll("contacts");
  const propertyNames = properties.results.map((p) => p.name);

  const companies = await hubspotClient.crm.companies.searchApi.doSearch({
    filterGroups: [
      {
        filters: [
          {
            propertyName: "name",
            operator: FilterOperatorEnum.ContainsToken,
            value: name,
          },
        ],
      },
    ],
    properties: propertyNames,
  });

  return companies.results;
};
