import type { PluginArgs } from "@dust-tt/types";

import type { Plugin } from "@app/lib/api/poke/types";

import * as allPlugins from "./plugins";

class PluginManager {
  private plugins: Map<string, Plugin<PluginArgs>> = new Map();
  private pluginsByResourceType: Record<string, Plugin<PluginArgs>[]> = {};

  constructor() {
    this.loadPlugins();
  }

  private loadPlugins(): void {
    for (const [, plugin] of Object.entries(allPlugins)) {
      if (this.isPlugin(plugin)) {
        const resourceTypes = this.getResourceTypesFromPlugin(plugin);

        for (const rt of resourceTypes) {
          if (!this.pluginsByResourceType[rt]) {
            this.pluginsByResourceType[rt] = [];
          }

          this.pluginsByResourceType[rt].push(plugin);
        }

        this.plugins.set(plugin.manifest.id, plugin);
      }
    }

    console.log(`Loaded ${this.plugins.size} plugins`);
    console.log(
      `Scopes: ${Object.keys(this.pluginsByResourceType).join(", ")}`
    );
  }

  private isPlugin(obj: any): obj is Plugin<PluginArgs> {
    return obj && typeof obj === "object" && "manifest" in obj;
  }

  private getResourceTypesFromPlugin(plugin: Plugin<PluginArgs>): string[] {
    // Assuming the plugin manifest has a 'scope' field
    // If not, you might need to determine the scope another way
    return plugin.manifest.resourceTypes || ["default"];
  }

  getPluginsForResourceType(resourceType: string): Plugin<PluginArgs>[] {
    return this.pluginsByResourceType[resourceType] || [];
  }

  getPluginById(pluginId: string): Plugin<PluginArgs> | undefined {
    return this.plugins.get(pluginId);
  }

  getAllPlugins(): Record<string, Plugin<PluginArgs>[]> {
    return this.pluginsByResourceType;
  }
}

export const pluginManager = new PluginManager();
