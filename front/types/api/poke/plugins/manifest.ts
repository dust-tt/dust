import type {
  PluginArgs,
  PluginManifest,
  SupportedResourceType,
} from "@app/types/poke/plugins";

export interface PokeGetPluginDetailsResponseBody {
  manifest: PluginManifest<PluginArgs, SupportedResourceType>;
}
