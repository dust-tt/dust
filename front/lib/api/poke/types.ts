import type { ResourceTypeMap } from "@app/lib/api/poke/utils";
import type { Authenticator } from "@app/lib/auth";
import type {
  AsyncFieldKeys,
  EnumValue,
  HasAsyncFields,
  PluginArgDefinition,
  PluginArgs,
  PluginManifest,
  Result,
  SupportedResourceType,
} from "@app/types";

interface FormidableFile {
  filepath: string;
  originalFilename: string;
  mimetype: string;
  size: number;
}

// Helper type to infer the correct TypeScript type from SupportedArgType.
type InferArgType<T extends PluginArgDefinition["type"]> = T extends "string"
  ? string
  : T extends "text"
    ? string
    : T extends "number"
      ? number
      : T extends "boolean"
        ? boolean
        : T extends "file"
          ? FormidableFile
          : T extends "enum"
            ? string[]
            : never;

// Helper type to map field types to their async value types
type AsyncValueTypeAtPopulate<T extends PluginArgDefinition> =
  T["type"] extends "enum"
    ? EnumValue[] // Only enums return arrays (options to choose from)
    : T["type"] extends "string"
      ? string
      : T["type"] extends "number"
        ? number
        : T["type"] extends "boolean"
          ? boolean
          : T["type"] extends "text"
            ? string
            : never;

// Type for async args that maps each field to its correct async value type
export type AsyncArgsType<T extends PluginArgs> = {
  [K in keyof T]?: T[K] extends { async: true }
    ? AsyncValueTypeAtPopulate<T[K]>
    : never;
};

export type InferPluginArgsAtExecution<T extends PluginArgs> = {
  [K in keyof T]: InferArgType<T[K]["type"]>;
};

export type PluginResponse =
  | { display: "text"; value: string }
  | { display: "json"; value: Record<string, unknown> }
  | { display: "markdown"; value: string }
  | { display: "textWithLink"; value: string; link: string; linkText: string };

// Base plugin interface.
interface BasePlugin<
  T extends PluginArgs,
  R extends SupportedResourceType = SupportedResourceType,
> {
  manifest: PluginManifest<T, R>;
  execute: (
    auth: Authenticator,
    resource: ResourceTypeMap[R] | null,
    args: InferPluginArgsAtExecution<T>
  ) => Promise<Result<PluginResponse, Error>>;
  isApplicableTo: (
    auth: Authenticator,
    resource: ResourceTypeMap[R] | null
  ) => boolean;
}

// Plugin with required async args function.
interface PluginWithAsyncArgs<
  T extends PluginArgs,
  R extends SupportedResourceType = SupportedResourceType,
> extends BasePlugin<T, R> {
  populateAsyncArgs: (
    auth: Authenticator,
    resource: ResourceTypeMap[R] | null
  ) => Promise<Result<Record<AsyncFieldKeys<T>, string[]>, Error>>;
}

// Plugin without async args function.
interface PluginWithoutAsyncArgs<
  T extends PluginArgs,
  R extends SupportedResourceType = SupportedResourceType,
> extends BasePlugin<T, R> {
  populateAsyncArgs?: never;
}

// Conditional Plugin type based on whether manifest has async fields.
export type Plugin<
  T extends PluginArgs,
  R extends SupportedResourceType = SupportedResourceType,
> =
  HasAsyncFields<T> extends true
    ? PluginWithAsyncArgs<T, R>
    : PluginWithoutAsyncArgs<T, R>;

export type AllPlugins =
  | PluginWithAsyncArgs<PluginArgs, SupportedResourceType>
  | PluginWithoutAsyncArgs<PluginArgs, SupportedResourceType>;

export function createPlugin<
  T extends PluginArgs,
  R extends SupportedResourceType,
>({
  manifest,
  execute,
  isApplicableTo = () => true,
  populateAsyncArgs,
}: {
  manifest: PluginManifest<T, R>;
  execute: (
    auth: Authenticator,
    resource: ResourceTypeMap[R] | null,
    args: InferPluginArgsAtExecution<T>
  ) => Promise<Result<PluginResponse, Error>>;
  isApplicableTo?: (
    auth: Authenticator,
    resource: ResourceTypeMap[R] | null
  ) => boolean;
} & (HasAsyncFields<T> extends true
  ? {
      populateAsyncArgs: (
        auth: Authenticator,
        resource: ResourceTypeMap[R] | null
      ) => Promise<Result<AsyncArgsType<T>, Error>>;
    }
  : {
      populateAsyncArgs?: never;
    })): Plugin<T, R> {
  return { manifest, execute, isApplicableTo, populateAsyncArgs } as Plugin<
    T,
    R
  >;
}

export type PluginListItem = Pick<
  PluginManifest<PluginArgs, SupportedResourceType>,
  "id" | "name" | "description"
>;
