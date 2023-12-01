import {
  EventSchemaPropertiesTypeForModel,
  eventSchemaPropertyAllTypes,
  EventSchemaPropertyType,
  ExtractedEventPropertyType,
} from "@dust-tt/types";

/**
 * We start with: 
 * [
    {
      name: "owner",
      type: "string",
      description: "The owner of the tasks",
    },
    {
      name: "tasks",
      type: "string[]",
      description: "The tasks of the day",
    },
  ]
 * And we want: 
  {
    owner: {
      type: "string",
      description: "The owner of the tasks",
    },
    tasks: {
      type: "array",
      items: {
        type: "string",
      },
      description: "The tasks of the day",
    },
  }
 * 
 */
export function formatPropertiesForModel(
  properties: EventSchemaPropertyType[]
) {
  const result: EventSchemaPropertiesTypeForModel = {};
  properties.forEach((property) => {
    const { name, type, description }: EventSchemaPropertyType = property;

    if (!eventSchemaPropertyAllTypes.includes(type)) {
      return;
    }

    // Split the type to check if it's an array
    const isArray = type.endsWith("[]");
    const itemType = isArray ? type.slice(0, -2) : type;

    // Create the property object based on whether it's an array or not
    result[name] = isArray
      ? {
          type: "array",
          items: {
            type: itemType,
          },
          description,
        }
      : {
          type,
          description,
        };
  });
  return result;
}

/**
 * Util to event properties according to schema
 * (Envent properties are stored in a jsonb column in db, which is unordered)
 */
export function sortedEventProperties(
  shemaProperties: EventSchemaPropertyType[],
  eventProperties: ExtractedEventPropertyType
): ExtractedEventPropertyType {
  const orderedEventProps: ExtractedEventPropertyType = {
    marker: eventProperties.marker,
  };

  shemaProperties.forEach(({ name }) => {
    if (Object.prototype.hasOwnProperty.call(eventProperties, name)) {
      orderedEventProps[name] = eventProperties[name];
    }
  });

  return orderedEventProps;
}
