import type {
  PluginArgDefinition,
  PluginArgs,
  PluginManifest,
  Result,
} from "@dust-tt/types";

import type { Authenticator } from "@app/lib/auth";

// Helper type to infer the correct TypeScript type from SupportedArgType.
type InferArgType<
  T extends PluginArgDefinition["type"],
  V = never,
> = T extends "string"
  ? string
  : T extends "number"
    ? number
    : T extends "boolean"
      ? boolean
      : T extends "enum"
        ? V
        : never;

type InferPluginArgs<T extends PluginArgs> = {
  [K in keyof T]: InferArgType<
    T[K]["type"],
    T[K] extends { values: readonly any[] } ? T[K]["values"][number] : never
  >;
};

export interface Plugin<T extends PluginArgs> {
  manifest: PluginManifest<T>;
  execute: (
    auth: Authenticator,
    resourceId: string | undefined,
    args: InferPluginArgs<T>
  ) => Promise<Result<string, Error>>;
}

export function createPlugin<T extends PluginArgs>(
  manifest: PluginManifest<T>,
  execute: Plugin<T>["execute"]
): Plugin<T> {
  return { manifest, execute };
}

export type PluginListItem = Pick<
  PluginManifest<PluginArgs>,
  "id" | "name" | "description"
>;
