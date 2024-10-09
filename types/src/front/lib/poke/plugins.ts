import * as t from "io-ts";

import { LightWorkspaceType } from "../../user";

type SupportedArgType = "string" | "number" | "boolean";

export interface PluginArgDefinition {
  type: SupportedArgType;
  label: string;
  description?: string;
}

export type PluginArgs = Record<string, PluginArgDefinition>;

export interface PluginManifest<T extends PluginArgs> {
  id: string;
  title: string;
  description: string;
  resourceTypes: string[];
  args: T;
}

export interface PluginWorkspaceResource {
  resourceId: string;
  workspace: LightWorkspaceType;
}

export function createIoTsCodecFromArgs(
  args: PluginArgs
): t.TypeC<Record<string, t.Mixed>> {
  const codecProps: Record<string, t.Mixed> = {};

  for (const [key, arg] of Object.entries(args)) {
    switch (arg.type) {
      case "string":
        codecProps[key] = t.string;
        break;
      case "number":
        codecProps[key] = t.number;
        break;
      case "boolean":
        codecProps[key] = t.boolean;
        break;
    }
  }

  return t.type(codecProps);
}
