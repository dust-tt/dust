import * as t from "io-ts";

import type { LightWorkspaceType } from "../user";

interface BaseArgDefinition {
  description?: string;
  label: string;
  redact?: boolean;
  async?: boolean;
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
}

interface TextArgDefinition extends BaseArgDefinition {
  type: "text";
  values?: never;
}

interface BooleanArgDefinition extends BaseArgDefinition {
  type: "boolean";
  values?: never;
}

interface FileArgDefinition extends BaseArgDefinition {
  type: "file";
  values?: never;
}

export type PluginArgDefinition =
  | EnumArgDefinition
  | AsyncEnumArgDefinition
  | StringArgDefinition
  | TextArgDefinition
  | NumberArgDefinition
  | BooleanArgDefinition
  | FileArgDefinition;

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

export function createIoTsCodecFromArgs(
  args: PluginArgs
): t.TypeC<Record<string, t.Mixed>> {
  const codecProps: Record<string, t.Mixed> = {};

  for (const [key, arg] of Object.entries(args)) {
    switch (arg.type) {
      case "text":
        codecProps[key] = t.string;
        break;

      case "string":
        codecProps[key] = t.string;
        break;

      case "number":
        codecProps[key] = t.number;
        break;

      case "boolean":
        codecProps[key] = t.boolean;
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
          codecProps[key] = t.array(t.string); // Allow any string for async enums initially.
        } else if (enumValues.length === 1) {
          codecProps[key] = t.array(t.literal(enumValues[0]));
        } else {
          codecProps[key] = t.array(t.string);
        }
        break;

      case "file":
        codecProps[key] = t.any;
        break;
    }
  }

  return t.type(codecProps);
}

export const supportedResourceTypes = [
  "apps",
  "data_source_views",
  "data_sources",
  "spaces",
  "workspaces",
  "agents",
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
  createdAt: number;
  author: string;
  pluginId: string;
  status: string;
  resourceType: string;
  resourceId: string | null;
  args: object;
}
