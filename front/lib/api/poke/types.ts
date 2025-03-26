import type { ResourceTypeMap } from "@app/lib/api/poke/utils";
import type { Authenticator } from "@app/lib/auth";
import type {
  PluginArgDefinition,
  PluginArgs,
  PluginManifest,
  Result,
  SupportedResourceType,
} from "@app/types";

// Helper type to infer the correct TypeScript type from SupportedArgType.
type InferArgType<
  T extends PluginArgDefinition["type"],
  V = never,
> = T extends "string"
  ? string
  : T extends "text"
    ? string
    : T extends "number"
      ? number
      : T extends "boolean"
        ? boolean
        : T extends "enum"
          ? V
          : never;

export type InferPluginArgs<T extends PluginArgs> = {
  [K in keyof T]: InferArgType<
    T[K]["type"],
    T[K] extends { values: readonly any[] } ? T[K]["values"][number] : never
  >;
};

export type PluginResponse =
  | { display: "text"; value: string }
  | { display: "json"; value: Record<string, unknown> };

export interface Plugin<
  T extends PluginArgs,
  R extends SupportedResourceType = SupportedResourceType,
> {
  manifest: PluginManifest<T, R>;
  execute: (
    auth: Authenticator,
    resource: ResourceTypeMap[R] | null,
    args: InferPluginArgs<T>
  ) => Promise<Result<PluginResponse, Error>>;
  isApplicableTo: (
    auth: Authenticator,
    resource: ResourceTypeMap[R] | null
  ) => boolean;
}

export function createPlugin<
  T extends PluginArgs,
  R extends SupportedResourceType,
>({
  manifest,
  execute,
  isApplicableTo = () => true,
}: {
  manifest: PluginManifest<T, R>;
  execute: Plugin<T, R>["execute"];
  isApplicableTo?: (
    auth: Authenticator,
    resource: ResourceTypeMap[R] | null
  ) => boolean;
}): Plugin<T, R> {
  return { manifest, execute, isApplicableTo };
}

export type PluginListItem = Pick<
  PluginManifest<PluginArgs, SupportedResourceType>,
  "id" | "name" | "description"
>;
