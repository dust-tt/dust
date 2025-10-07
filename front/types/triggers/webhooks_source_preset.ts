type EventFieldBase = {
  name: string;
  description: string;
};

export type EventFieldType =
  | (EventFieldBase & {
      type:
        | "string"
        | "number"
        | "boolean"
        | "array"
        | "null"
        | "unknown-object";
    })
  | (EventFieldBase & {
      type: "enum";
      enumValues: string[];
    })
  | (EventFieldBase & {
      type: "parent-field" | "parent-of-array";
      childrentFields: EventFieldType[];
    });

export type EventCheckType = {
  type: "header" | "payload";
  field: string;
};

export type EventType = {
  name: string;
  value: string;
  description: string;
  fields: EventFieldType[];
};

export type PresetWebhookType = {
  name: string;
  eventCheck: EventCheckType | null;
  events: EventType[];
};
