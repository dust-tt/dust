type EventFieldBase = {
  name: string;
  description: string;
};

export type EventField =
  | (EventFieldBase & {
      type: "string" | "number" | "boolean" | "array" | "null" | "unknown-object";
    })
  | (EventFieldBase & {
      type: "enum";
      enumValues: string[];
    })
  | (EventFieldBase & {
      type: "object";
      isArray: boolean;
      childrenFields: EventField[];
    });

export type EventCheck = {
  type: "header" | "payload";
  field: string;
};

export type WebhookEvent = {
  name: string;
  value: string;
  description: string;
  fields: EventField[];
};

export type PresetWebhook = {
  name: string;
  eventCheck: EventCheck | null;
  events: WebhookEvent[];
};
