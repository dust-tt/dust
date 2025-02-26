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
  : T extends "text"
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

export type PluginResponse =
  | { display: "text"; value: string }
  | { display: "json"; value: Record<string, unknown> };

export interface Plugin<T extends PluginArgs> {
  manifest: PluginManifest<T>;
  execute: (
    auth: Authenticator,
    resourceId: string | undefined,
    args: InferPluginArgs<T>
  ) => Promise<Result<PluginResponse, Error>>;
  isVisible: (
    auth: Authenticator,
    resourceId: string | undefined
  ) => Promise<boolean>;
}

export function createPlugin<T extends PluginArgs>({
  manifest,
  execute,
  isVisible = () => Promise.resolve(true),
}: {
  manifest: PluginManifest<T>;
  execute: Plugin<T>["execute"];
  isVisible?: (
    auth: Authenticator,
    resourceId: string | undefined
  ) => Promise<boolean>;
}): Plugin<T> {
  return { manifest, execute, isVisible };
}

export type PluginListItem = Pick<
  PluginManifest<PluginArgs>,
  "id" | "name" | "description"
>;
