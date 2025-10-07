import { GithubLogo, JiraLogo } from "@dust-tt/sparkle";

type EventFieldBase = {
  name: string;
  description: string;
};

export type EventField =
  | (EventFieldBase & {
      type: "string" | "number" | "boolean" | "array" | "null";
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

const WebhookPresetIcons = {
  GithubLogo,
  JiraLogo,
} as const;

export type WebhookPresetIcon =
  (typeof WebhookPresetIcons)[keyof typeof WebhookPresetIcons];

export type PresetWebhook = {
  name: string;
  eventCheck: EventCheck | null;
  events: WebhookEvent[];
  icon: WebhookPresetIcon;
  description: string;
};
