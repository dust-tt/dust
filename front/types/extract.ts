export type EventSchemaStatus = "active" | "disabled";

export type EventSchemaType = {
  marker: string;
  description?: string;
  status: EventSchemaStatus;
  properties: {
    name: string;
    type: number[] | Date[] | string[];
    description: string;
  }[];
};
