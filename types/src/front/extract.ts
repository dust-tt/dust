import { ModelId } from "../shared/model_id";

export type EventSchemaStatus = "active" | "disabled";
export type ExtractedEventStatus = "pending" | "accepted" | "rejected";

export type EventSchemaType = {
  id: ModelId;
  sId: string;
  marker: string;
  description: string | null;
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
  properties: ExtractedEventPropertyType;
  status: ExtractedEventStatus;
  dataSourceName: string;
  documentId: string;
  documentSourceUrl: string | null;
  schema: {
    marker: string;
    sId: string;
  };
};

export type ExtractedEventPropertyType = {
  [key: string]: string | string[];
};
