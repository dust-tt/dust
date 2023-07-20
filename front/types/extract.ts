export type EventSchemaStatus = "active" | "disabled";

export type EventSchemaType = {
  marker: string;
  description?: string;
  status: EventSchemaStatus;
  properties: EventSchemaPropertyType[];
};

export const eventSchemaPropertyTypeOptions = [
  "boolean",
  "number",
  "string",
  "Date",
  "number[]",
  "string[]",
  "Date[]",
] as const;

export type EventSchemaPropertyType = {
  name: string;
  type: (typeof eventSchemaPropertyTypeOptions)[number];
  description: string;
};
