import { z } from "zod";

import type { LightWorkspaceType } from "../user";

export interface DependsOnCondition {
  field: string;
  // The value the dependency field must hold for this field to render. For a
  // boolean field this is the toggle state; for an enum field it's the value
  // that must be selected (matched by membership against the selected values).
  value: boolean | string;
}

interface BaseArgDefinition {
  description?: string;
  label: string;
  redact?: boolean;
  async?: boolean;
  asyncDescription?: boolean;
  // A single condition, or an array of conditions ANDed together — the field
  // renders only when every condition matches.
  dependsOn?: DependsOnCondition | DependsOnCondition[];
}

type AtLeastTwoElements<T> = readonly [T, T, ...T[]];

export type EnumValue = {
  label: string;
  value: string;
  checked?: boolean;
};

export type EnumValues = AtLeastTwoElements<EnumValue>;
export type AsyncEnumValues = readonly EnumValue[];

// Helper function to convert arrays with at least 2 elements to EnumValues.
export function mapToEnumValues<T>(
  items: AtLeastTwoElements<T>,
  mapper: (item: T) => EnumValue
): AtLeastTwoElements<EnumValue> {
  const [first, second, ...rest] = items;

  return [mapper(first), mapper(second), ...rest.map(mapper)];
}

interface EnumArgDefinition extends BaseArgDefinition {
  type: "enum";
  values: EnumValues;
  async?: false;
  multiple: boolean;
}

interface AsyncEnumArgDefinition extends BaseArgDefinition {
  type: "enum";
  values: AsyncEnumValues;
  async: true;
  multiple: boolean;
}

interface StringArgDefinition extends BaseArgDefinition {
  type: "string";
  values?: never;
}

interface NumberArgDefinition extends BaseArgDefinition {
  type: "number";
  values?: never;
  variant?: "text" | "spinner";
  default?: number;
}

interface TextArgDefinition extends BaseArgDefinition {
  type: "text";
  values?: never;
}

interface BooleanArgDefinition extends BaseArgDefinition {
  type: "boolean";
  values?: never;
  variant?: "checkbox" | "toggle";
  default?: boolean;
  async?: false;
}

interface AsyncBooleanArgDefinition extends BaseArgDefinition {
  type: "boolean";
  values?: never;
  variant?: "checkbox" | "toggle";
  default?: boolean;
  async: true;
}

interface FileArgDefinition extends BaseArgDefinition {
  type: "file";
  values?: never;
}

interface DateArgDefinition extends BaseArgDefinition {
  type: "date";
  values?: never;
}

export type PluginArgDefinition =
  | EnumArgDefinition
  | AsyncEnumArgDefinition
  | StringArgDefinition
  | TextArgDefinition
  | NumberArgDefinition
  | BooleanArgDefinition
  | AsyncBooleanArgDefinition
  | FileArgDefinition
  | DateArgDefinition;

export type StrictPluginArgs = {
  [key: string]: PluginArgDefinition;
};

export type PluginArgs = Record<string, PluginArgDefinition>;

// Utility types for async field detection.
export type HasAsyncFields<T extends PluginArgs> = {
  [K in keyof T]: T[K] extends { async: true } ? true : never;
}[keyof T] extends never
  ? false
  : true;

export type AsyncFieldKeys<T extends PluginArgs> = {
  [K in keyof T]: T[K] extends { async: true } ? K : never;
}[keyof T];

export interface PluginManifest<
  T extends PluginArgs,
  R extends SupportedResourceType,
> {
  args: T;
  description: string;
  explanation?: string;
  id: string;
  name: string;
  resourceTypes: R[];
  warning?: string;
  isHidden?: boolean;
  readonly?: boolean;
  redactResult?: boolean;
}

interface PluginResourceScope {
  resourceType: SupportedResourceType;
}

interface PluginWorkspaceResource extends PluginResourceScope {
  resourceId: string;
  workspace: LightWorkspaceType;
}

export type PluginResourceTarget =
  | PluginResourceScope
  | PluginWorkspaceResource;

export function createZodSchemaFromArgs(
  args: PluginArgs
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const schemaProps: Record<string, z.ZodTypeAny> = {};

  for (const [key, arg] of Object.entries(args)) {
    switch (arg.type) {
      case "text":
        schemaProps[key] = z.string();
        break;

      case "string":
        schemaProps[key] = z.string();
        break;

      case "number":
        schemaProps[key] = z.number();
        break;

      case "boolean":
        schemaProps[key] = z.boolean();
        break;

      case "enum":
        if (!Array.isArray(arg.values)) {
          throw new Error(`Enum argument "${key}" must be an array`);
        }

        // For async enums, allow empty arrays initially
        // For non-async enums, require at least 2 values.
        if (!arg.async && arg.values.length < 2) {
          throw new Error(
            `Non-async enum argument "${key}" must have at least two values`
          );
        }

        // Extract values from EnumValue objects.
        const enumValues = arg.values.map((v) => v.value) as string[];

        // Handle empty async enums
        if (enumValues.length === 0) {
          schemaProps[key] = z.array(z.string()); // Allow any string for async enums initially.
        } else if (enumValues.length === 1) {
          schemaProps[key] = z.array(z.literal(enumValues[0]));
        } else {
          schemaProps[key] = z.array(z.string());
        }
        break;

      case "file":
        schemaProps[key] = z.any();
        break;

      case "date":
        schemaProps[key] = z.string();
        break;
    }
  }

  return z.object(schemaProps);
}

export const supportedResourceTypes = [
  "apps",
  "conversations",
  "data_source_views",
  "data_sources",
  "mcp_server_views",
  "skills",
  "spaces",
  "workspaces",
  "agents",
  "triggers",
  // Special case for global operations.
  "global",
] as const;

export type SupportedResourceType = (typeof supportedResourceTypes)[number];

export function isSupportedResourceType(
  resourceType: string
): resourceType is SupportedResourceType {
  return supportedResourceTypes.includes(resourceType as SupportedResourceType);
}

export interface PluginRunType {
  args: object;
  author: string;
  createdAt: number;
  error: string | null;
  pluginId: string;
  resourceId: string | null;
  resourceType: string;
  result: string | null;
  status: string;
}
