import type { Plugin } from "@app/lib/api/poke/types";
import type { PluginArgs, SupportedResourceType } from "@app/types";

import * as allPlugins from "./plugins";

class PluginManager {
  private plugins: Map<string, Plugin<PluginArgs>> = new Map();
  private pluginsByResourceType: Partial<
    Record<SupportedResourceType, Plugin<PluginArgs>[]>
  > = {};

  constructor() {
    this.loadPlugins();
  }

  private loadPlugins(): void {
    for (const [, plugin] of Object.entries(allPlugins)) {
      if (this.isPlugin(plugin)) {
        const resourceTypes = this.getResourceTypesFromPlugin(plugin);

        for (const rt of resourceTypes) {
          // Initialize and push in one statement.
          (this.pluginsByResourceType[rt] =
            this.pluginsByResourceType[rt] || []).push(plugin);
        }

        this.plugins.set(plugin.manifest.id, plugin);
      }
    }
  }

  private isPlugin(obj: any): obj is Plugin<PluginArgs> {
    return obj && typeof obj === "object" && "manifest" in obj;
  }

  private getResourceTypesFromPlugin(
    plugin: Plugin<PluginArgs>
  ): SupportedResourceType[] {
    return plugin.manifest.resourceTypes || ["default"];
  }

  getPluginsForResourceType(
    resourceType: SupportedResourceType
  ): Plugin<PluginArgs>[] {
    return this.pluginsByResourceType[resourceType] || [];
  }

  getPluginById(pluginId: string): Plugin<PluginArgs> | undefined {
    return this.plugins.get(pluginId);
  }
}

export const pluginManager = new PluginManager();
