import type { AllPlugins } from "@app/lib/api/poke/types";
import type { SupportedResourceType } from "@app/types";

import * as allPlugins from "./plugins";

class PluginManager {
  private plugins: Map<string, AllPlugins> = new Map();
  private pluginsByResourceType: Partial<
    Record<SupportedResourceType, AllPlugins[]>
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

  private isPlugin(obj: any): obj is AllPlugins {
    return obj && typeof obj === "object" && "manifest" in obj;
  }

  private getResourceTypesFromPlugin(
    plugin: AllPlugins
  ): SupportedResourceType[] {
    return plugin.manifest.resourceTypes || ["default"];
  }

  getPluginsForResourceType(resourceType: SupportedResourceType): AllPlugins[] {
    return this.pluginsByResourceType[resourceType] || [];
  }

  getPluginById(pluginId: string): AllPlugins | undefined {
    return this.plugins.get(pluginId);
  }
}

export const pluginManager = new PluginManager();
