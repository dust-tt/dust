import * as t from "io-ts";

import type { LightWorkspaceType } from "../user";

interface BaseArgDefinition {
  description?: string;
  label: string;
  redact?: boolean;
}

type AtLeastTwoElements<T> = readonly [T, T, ...T[]];

interface EnumArgDefinition extends BaseArgDefinition {
  type: "enum";
  values: AtLeastTwoElements<string>;
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

export type PluginArgDefinition =
  | EnumArgDefinition
  | StringArgDefinition
  | TextArgDefinition
  | NumberArgDefinition
  | BooleanArgDefinition;

export type StrictPluginArgs = {
  [key: string]: PluginArgDefinition;
};

export type PluginArgs = Record<string, PluginArgDefinition>;

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
        if (!Array.isArray(arg.values) || arg.values.length < 2) {
          throw new Error(
            `Enum argument "${key}" must have at least two values`
          );
        }
        codecProps[key] = t.union([
          t.literal(arg.values[0]),
          t.literal(arg.values[1]),
          ...arg.values.slice(2).map((v) => t.literal(v)),
        ]);
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
  // Special case for global operations.
  "global",
] as const;

export type SupportedResourceType = (typeof supportedResourceTypes)[number];

export function isSupportedResourceType(
  resourceType: string
): resourceType is SupportedResourceType {
  return supportedResourceTypes.includes(resourceType as SupportedResourceType);
}
