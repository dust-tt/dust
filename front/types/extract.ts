import { ModelId } from "@app/lib/models";

export type EventSchemaStatus = "active" | "disabled";

export type EventSchemaType = {
  id: ModelId;
  sId: string;
  marker: string;
  description?: string;
  status: EventSchemaStatus;
  properties: EventSchemaPropertyType[];
};

export const eventSchemaPrimitiveTypes = ["string", "number", "boolean"];
export const eventSchemaListTypes = ["string[]", "number[]", "boolean[]"];
export const eventSchemaPropertyAllTypes = [
  ...eventSchemaPrimitiveTypes,
  ...eventSchemaListTypes,
] as const;

// Properties in the EventSchema table are stored as an array of objects
export type EventSchemaPropertyType = {
  name: string;
  type: (typeof eventSchemaPropertyAllTypes)[number];
  description: string;
};

// Properties to send to the Dust must be as an object
export type EventSchemaPropertiesTypeForModel = {
  [key: string]: {
    type: "array" | (typeof eventSchemaPropertyAllTypes)[number];
    description: string;
    items?: { type: (typeof eventSchemaPropertyAllTypes)[number] };
  };
};

export type ExtractedEventType = {
  id: ModelId;
  sId: string;
  marker: string;
  properties: {
    [key: string]: string | string[];
  };
  dataSourceName: string;
  documentId: string;
  documentSourceUrl: string | null;
};
