import { Client } from "@hubspot/api-client";
import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/contacts";
import type { SimplePublicObject } from "@hubspot/api-client/lib/codegen/crm/objects/models/SimplePublicObject";
import type { SimplePublicObjectInputForCreate } from "@hubspot/api-client/lib/codegen/crm/objects/models/SimplePublicObjectInputForCreate";
import type { Property } from "@hubspot/api-client/lib/codegen/crm/properties/models/Property";

/**
 * Get all createable properties for a contact.
 * We filter out properties that are not createable, hidden, calculated, read-only or file uploads.
 */
export const getContactCreateableProperties = async (accessToken: string) => {
  const hubspotClient = new Client({ accessToken });
  const props = await hubspotClient.crm.properties.coreApi.getAll("contacts");
  const isCreateableProperty = (property: Property) =>
    property.formField === true && // Can be used in forms.
    !property.hidden && // Not hidden.
    !property.calculated && // Not auto-calculated.
    !property.modificationMetadata?.readOnlyValue && // Value can be modified.
    property.type !== "file"; // Exclude file uploads if any.
  const createableProperties = props.results.filter(isCreateableProperty);

  return createableProperties.map((p) => ({
    name: p.name,
    label: p.label,
    type: p.type,
    description: p.description,
    options: p.options,
  }));
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
