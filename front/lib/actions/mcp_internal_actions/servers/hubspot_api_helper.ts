import { Client } from "@hubspot/api-client";
import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/contacts";
import type { SimplePublicObject } from "@hubspot/api-client/lib/codegen/crm/objects/models/SimplePublicObject";
import type { SimplePublicObjectInputForCreate } from "@hubspot/api-client/lib/codegen/crm/objects/models/SimplePublicObjectInputForCreate";
import type { Property } from "@hubspot/api-client/lib/codegen/crm/properties/models/Property";

const MAX_ENUM_OPTIONS_DISPLAYED = 10;

/**
 * Get all createable properties for an object.
 * creatableOnly = true: filter out properties that are not createable, hidden, calculated, read-only or file uploads.
 * creatableOnly = false: return all properties.
 */
export const getProperties = async ({
  accessToken,
  objectType,
  creatableOnly,
}: {
  accessToken: string;
  objectType: "contacts" | "companies" | "deals" | "leads";
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
 * Create a contact from a list of properties.
 * The contact will be created with the properties passed in the `contactProperties` parameter.
 */
export const createContact = async (
  accessToken: string,
  contactProperties: SimplePublicObjectInputForCreate
) => {
  const hubspotClient = new Client({ accessToken });
  const contact =
    await hubspotClient.crm.contacts.basicApi.create(contactProperties);
  return contact;
};

/**
 * Update a contact.
 * The contact will be updated with the properties passed in the `contactProperties` parameter.
 */
export const updateContact = async (
  accessToken: string,
  contactId: string,
  contactProperties: SimplePublicObjectInputForCreate
) => {
  const hubspotClient = new Client({ accessToken });
  const contact = await hubspotClient.crm.contacts.basicApi.update(
    contactId,
    contactProperties
  );
  return contact;
};

/**
 * Get a contact by email.
 * A email is unique, so there will only be zero or one contact with a given email.
 */
export const getContactByEmail = async (
  accessToken: string,
  email: string
): Promise<SimplePublicObject | null> => {
  const hubspotClient = new Client({ accessToken });

  // First get all available properties.
  const properties =
    await hubspotClient.crm.properties.coreApi.getAll("contacts");
  const propertyNames = properties.results.map((p) => p.name);

  const contact = await hubspotClient.crm.contacts.searchApi.doSearch({
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

  if (contact.results.length === 0) {
    return null;
  }

  return contact.results[0];
};

/**
 * Get a contact by name.
 * A name is not unique, so there may be multiple contacts with the same name.
 */
export const getContactByName = async (
  accessToken: string,
  firstname: string,
  lastname: string
): Promise<SimplePublicObject[]> => {
  const hubspotClient = new Client({ accessToken });

  // First get all available properties.
  const properties =
    await hubspotClient.crm.properties.coreApi.getAll("contacts");
  const propertyNames = properties.results.map((p) => p.name);

  const contacts = await hubspotClient.crm.contacts.searchApi.doSearch({
    filterGroups: [
      {
        filters: [
          {
            propertyName: "firstname",
            operator: FilterOperatorEnum.ContainsToken,
            value: firstname,
          },
          {
            propertyName: "lastname",
            operator: FilterOperatorEnum.ContainsToken,
            value: lastname,
          },
        ],
      },
    ],
    properties: propertyNames,
  });

  return contacts.results;
};
